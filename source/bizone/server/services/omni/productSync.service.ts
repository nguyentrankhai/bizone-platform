import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import {
  MARKETPLACE_NAME,
  MAX_IMAGES,
  channelPrice,
  channelStock,
  resolveCategory,
  type MarketplaceCode,
  type MarketplaceConfig,
} from "@/lib/omni/marketplace";
import { branchWarehouseId } from "@/server/services/invoice.service";
import { connectorFor } from "./marketplace/registry";
import { fetchImage } from "./marketplace/http";
import { MarketplaceError, type ListingInput, type ListingUpdate } from "./marketplace/types";
import {
  asBizError,
  channelById,
  channelState,
  findChannel,
  requireConfig,
  withShop,
  type ChannelRow,
} from "./marketplaceChannel.service";
import { logSync, reportSyncFailure } from "./websiteChannel.service";

/**
 * Products on marketplaces (P6.2).
 *
 * - Push: the admin picks products → placeholder rows in `channel_product_mapping` (pending) →
 *   worker creates the listing (images uploaded, category from the category map, one variation
 *   tier for products with variants) and stores item / model ids per variant.
 * - Price + stock: every ~10 s the worker recomputes each active listing's price (selling price
 *   × markup) and stock (on hand at the channel branch's first warehouse − buffer) and pushes
 *   only what changed — so any stock movement (POS, website, receipts, transfers, stock takes)
 *   reaches the marketplace in < 30 s without hooks in every flow.
 */

// ─── Admin listing view ──────────────────────────────────────────────────────

export async function listListings(
  code: MarketplaceCode,
  input: {
    search?: string;
    page: number;
    limit: number;
    status?: "none" | "synced" | "pending" | "error" | "paused";
  },
) {
  const prisma = getPrisma();
  const ch = await findChannel(code);
  const cfg = ch ? requireConfigOrNull(ch) : null;
  const warehouseId = cfg ? await branchWarehouseId(cfg.branchId) : null;
  const channelId = ch?.id ?? -1;
  const q = input.search?.trim();
  const statusWhere =
    input.status === "none"
      ? { channelProductMapping: { none: { channelId } } }
      : input.status === "paused"
        ? { channelProductMapping: { some: { channelId, isActive: false } } }
        : input.status
          ? {
              channelProductMapping: {
                some: { channelId, isActive: true, syncStatus: input.status },
              },
            }
          : {};
  const where = {
    status: "active" as const,
    ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    ...statusWhere,
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        name: true,
        sku: true,
        image: true,
        sellingPrice: true,
        categoryId: true,
        category: { select: { name: true } },
        trackInventory: true,
        productVariants: { where: { status: "active" }, select: { id: true } },
        productImages: { select: { id: true }, take: 1 },
        channelProductMapping: {
          where: { channelId },
          select: {
            variantId: true,
            channelProductId: true,
            channelPrice: true,
            channelStock: true,
            isActive: true,
            syncStatus: true,
            lastError: true,
            lastSyncAt: true,
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);
  const stock = warehouseId
    ? await prisma.inventory.groupBy({
        by: ["productId"],
        where: { warehouseId, productId: { in: rows.map((r) => r.id) } },
        _sum: { quantity: true },
      })
    : [];
  const onHand = new Map(stock.map((s) => [s.productId, Number(s._sum.quantity ?? 0)]));
  return {
    items: rows.map((r) => {
      const maps = r.channelProductMapping;
      const status =
        maps.length === 0
          ? "none"
          : maps.some((m) => !m.isActive)
            ? "paused"
            : maps.some((m) => m.syncStatus === "error")
              ? "error"
              : maps.some((m) => m.syncStatus === "pending")
                ? "pending"
                : "synced";
      return {
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category?.name ?? null,
        hasImage: !!r.image || r.productImages.length > 0,
        variants: r.productVariants.length,
        price: Number(r.sellingPrice),
        channelPrice: cfg ? channelPrice(Number(r.sellingPrice), cfg.priceMarkupPercent) : null,
        onHand: r.trackInventory ? (onHand.get(r.id) ?? 0) : null,
        listedStock: maps.length ? maps.reduce((t, m) => t + (m.channelStock ?? 0), 0) : null,
        itemId: maps.find((m) => m.channelProductId)?.channelProductId ?? null,
        status,
        error: maps.find((m) => m.lastError)?.lastError ?? null,
        lastSyncAt:
          maps
            .map((m) => m.lastSyncAt)
            .filter(Boolean)
            .sort()
            .at(-1)
            ?.toISOString() ?? null,
      };
    }),
    total,
    page: input.page,
    limit: input.limit,
  };
}

function requireConfigOrNull(ch: ChannelRow) {
  try {
    return requireConfig(ch, ch.channelCode as MarketplaceCode);
  } catch {
    return null;
  }
}

// ─── Push (create listings) ──────────────────────────────────────────────────

/** Mark products for publishing; returns the channel to enqueue a push job for */
export async function markProductsForPush(code: MarketplaceCode, productIds: number[]) {
  const prisma = getPrisma();
  const ch = await findChannel(code);
  if (!ch || channelState(ch) !== "connected")
    throw bizoneError("CONFLICT", `${MARKETPLACE_NAME[code]} chưa kết nối hoặc đang tạm ngừng`);
  requireConfig(ch, code);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "active" },
    select: { id: true },
  });
  if (products.length !== new Set(productIds).size)
    throw bizoneError("VALIDATION_ERROR", "Có sản phẩm không tồn tại hoặc đã ngừng bán");
  const existing = await prisma.channelProductMapping.findMany({
    where: { channelId: ch.id, productId: { in: productIds } },
    select: { productId: true },
  });
  const have = new Set(existing.map((e) => e.productId));
  const fresh = productIds.filter((id) => !have.has(id));
  if (fresh.length)
    await prisma.channelProductMapping.createMany({
      data: fresh.map((productId) => ({
        channelId: ch.id,
        productId,
        syncStatus: "pending" as const,
      })),
    });
  // Already listed: resume + force a price / stock push; failed creations retry
  await prisma.channelProductMapping.updateMany({
    where: { channelId: ch.id, productId: { in: [...have] } },
    data: { isActive: true, channelPrice: null, channelStock: null },
  });
  await prisma.channelProductMapping.updateMany({
    where: { channelId: ch.id, productId: { in: [...have] }, channelProductId: null },
    data: { syncStatus: "pending", lastError: null },
  });
  return { channelId: ch.id, queued: productIds.length, created: fresh.length };
}

export async function setListingActive(
  code: MarketplaceCode,
  productId: number,
  isActive: boolean,
) {
  const ch = await findChannel(code);
  if (!ch) throw bizoneError("NOT_FOUND", `Chưa kết nối ${MARKETPLACE_NAME[code]}`);
  const res = await getPrisma().channelProductMapping.updateMany({
    where: { channelId: ch.id, productId },
    data: { isActive, ...(isActive ? { channelStock: null, channelPrice: null } : {}) },
  });
  if (res.count === 0) throw bizoneError("NOT_FOUND", "Sản phẩm chưa được đăng lên kênh này");
  return { isActive };
}

async function categoryParents() {
  const cats = await getPrisma().productCategory.findMany({ select: { id: true, parentId: true } });
  return new Map(cats.map((c) => [c.id, c.parentId]));
}

async function buildListing(
  ch: ChannelRow,
  cfg: MarketplaceConfig,
  productId: number,
  warehouseId: number | null,
  parents: Map<number, number | null>,
): Promise<ListingInput> {
  const code = ch.channelCode as MarketplaceCode;
  const prisma = getPrisma();
  const p = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: {
      productImages: { orderBy: { sortOrder: "asc" } },
      productVariants: {
        where: { status: "active" },
        orderBy: { id: "asc" },
        include: { productVariantAttributes: true },
      },
    },
  });
  const categoryId = resolveCategory(p.categoryId, parents, cfg.categoryMap);
  if (!categoryId)
    throw new MarketplaceError(
      "invalid",
      `Danh mục của "${p.name}" chưa được ghép với danh mục ${MARKETPLACE_NAME[code]} (tab Danh mục)`,
    );
  const urls = [
    p.image,
    ...p.productImages.map((i) => i.imageUrl),
    ...p.productVariants.map((v) => v.image),
  ]
    .filter((u): u is string => !!u)
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, MAX_IMAGES[code]);
  if (urls.length === 0)
    throw new MarketplaceError("invalid", `"${p.name}" chưa có ảnh — sàn yêu cầu ít nhất 1 ảnh`);
  const images = [];
  for (const [i, url] of urls.entries()) {
    const img = await fetchImage(url);
    const ext = img.contentType.split("/")[1].replace("jpeg", "jpg");
    images.push({ ...img, filename: `${p.sku}-${i + 1}.${ext}` });
  }
  const stockRows = warehouseId
    ? await prisma.inventory.findMany({
        where: { warehouseId, productId },
        select: { variantId: true, quantity: true },
      })
    : [];
  const onHand = (variantId: number | null) =>
    stockRows.filter((r) => r.variantId === variantId).reduce((t, r) => t + Number(r.quantity), 0);
  const stockOf = (variantId: number | null) =>
    p.trackInventory ? channelStock(onHand(variantId), cfg.stockBuffer) : 0;
  const description =
    (p.description?.trim() || p.name).length >= 20
      ? p.description?.trim() || p.name
      : `${p.name} — ${p.description?.trim() || "hàng chính hãng, giao nhanh"}`;
  return {
    sku: p.sku,
    name: p.name,
    description,
    categoryId,
    price: channelPrice(Number(p.sellingPrice), cfg.priceMarkupPercent),
    stock: stockOf(null),
    weightKg: Number(p.weight ?? 0) > 0 ? Number(p.weight) : cfg.defaultWeightKg,
    packageCm: cfg.packageCm,
    images,
    variants: p.productVariants.map((v) => ({
      sku: v.sku,
      name:
        v.productVariantAttributes.map((a) => a.attributeValue).join(" / ") ||
        v.sku.replace(`${p.sku}-`, ""),
      price: channelPrice(Number(v.sellingPrice || p.sellingPrice), cfg.priceMarkupPercent),
      stock: stockOf(v.id),
    })),
  };
}

/**
 * Worker: create listings for pending products of a channel (or the given ones) and push
 * price / stock of the already listed ones. Retryable platform errors are re-thrown after the
 * batch so BullMQ retries; data problems stay on the product row (error + sync log).
 */
export async function pushProducts(channelId: number, productIds?: number[]) {
  const ch = await channelById(channelId);
  if (!ch) return { skipped: "no channel" };
  const code = ch.channelCode as MarketplaceCode;
  const cfg = requireConfig(ch, code);
  const lock = await getRedis().set(
    `omni:push:${currentTenantId()}:${channelId}`,
    "1",
    "PX",
    10 * 60_000,
    "NX",
  );
  if (!lock) throw new Error("Đang có lượt đăng sản phẩm khác của kênh này"); // BullMQ retries later
  try {
    const prisma = getPrisma();
    const pending = await prisma.channelProductMapping.findMany({
      where: {
        channelId,
        isActive: true,
        channelProductId: null,
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      select: { id: true, productId: true },
    });
    const warehouseId = await branchWarehouseId(cfg.branchId);
    const parents = await categoryParents();
    const connector = connectorFor(code);
    let created = 0;
    let failed = 0;
    let retry: MarketplaceError | null = null;
    for (const row of [...new Map(pending.map((r) => [r.productId, r])).values()]) {
      const product = await prisma.product.findUnique({
        where: { id: row.productId },
        select: { name: true, sku: true },
      });
      try {
        const input = await buildListing(ch, cfg, row.productId, warehouseId, parents);
        const result = await withShop(ch, (ctx) => connector.createListing(ctx, input));
        const variants = await prisma.productVariant.findMany({
          where: { productId: row.productId, sku: { in: input.variants.map((v) => v.sku) } },
          select: { id: true, sku: true },
        });
        await prisma.$transaction(async (tx) => {
          await tx.channelProductMapping.deleteMany({
            where: { channelId, productId: row.productId, channelProductId: null },
          });
          await tx.channelProductMapping.createMany({
            data: result.models.map((m) => {
              const v = input.variants.find((x) => x.sku === m.sku);
              return {
                channelId,
                productId: row.productId,
                variantId: v ? (variants.find((x) => x.sku === m.sku)?.id ?? null) : null,
                channelProductId: result.itemId,
                channelModelId: m.modelId,
                channelSku: m.sku,
                channelPrice: v ? v.price : input.price,
                channelStock: v ? v.stock : input.stock,
                syncStatus: "synced" as const,
                lastSyncAt: new Date(),
              };
            }),
          });
        });
        created++;
        await logSync({
          channelId,
          syncType: "product",
          direction: "push",
          status: "success",
          message: `Đăng "${product?.name}" lên ${MARKETPLACE_NAME[code]} (item ${result.itemId})`,
          details: {
            productId: row.productId,
            itemId: result.itemId,
            models: result.models.length,
          },
        });
      } catch (e) {
        if (e instanceof MarketplaceError && (e.retryable || e.kind === "auth")) {
          retry = e;
          if (e.kind === "auth") break;
          continue;
        }
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        await prisma.channelProductMapping.updateMany({
          where: { channelId, productId: row.productId, channelProductId: null },
          data: { syncStatus: "error", lastError: message.slice(0, 2000) },
        });
        await logSync({
          channelId,
          syncType: "product",
          direction: "push",
          status: "failed",
          message: `Không đăng được "${product?.name ?? row.productId}": ${message}`,
          details: { productId: row.productId, sku: product?.sku },
        });
      }
    }
    // Listed products the admin re-selected: push price / stock now
    const stockResult = await syncChannelStock(channelId, productIds ? { productIds } : {});
    if (retry && retry.kind !== "auth") throw retry;
    return { created, failed, pending: pending.length, stock: stockResult };
  } finally {
    await getRedis()
      .del(`omni:push:${currentTenantId()}:${channelId}`)
      .catch(() => undefined);
  }
}

// ─── Price / stock sync ──────────────────────────────────────────────────────

/** Desired price / stock of the active listings of a channel */
async function desiredListings(ch: ChannelRow, cfg: MarketplaceConfig, productIds?: number[]) {
  const prisma = getPrisma();
  const maps = await prisma.channelProductMapping.findMany({
    where: {
      channelId: ch.id,
      isActive: true,
      channelProductId: { not: null },
      ...(productIds ? { productId: { in: productIds } } : {}),
    },
    include: {
      product: { select: { sellingPrice: true, status: true, trackInventory: true } },
      variant: { select: { sellingPrice: true, status: true } },
    },
  });
  const warehouseId = await branchWarehouseId(cfg.branchId);
  const inv = warehouseId
    ? await prisma.inventory.findMany({
        where: { warehouseId, productId: { in: [...new Set(maps.map((m) => m.productId))] } },
        select: { productId: true, variantId: true, quantity: true },
      })
    : [];
  const onHand = new Map<string, number>();
  for (const r of inv) {
    const k = `${r.productId}:${r.variantId ?? 0}`;
    onHand.set(k, (onHand.get(k) ?? 0) + Number(r.quantity));
  }
  return maps.map((m) => {
    const sellable =
      m.product.status === "active" && (m.variant ? m.variant.status === "active" : true);
    const base =
      m.variant && Number(m.variant.sellingPrice) > 0
        ? m.variant.sellingPrice
        : m.product.sellingPrice;
    const price = channelPrice(Number(base), cfg.priceMarkupPercent);
    const stock = m.product.trackInventory
      ? channelStock(
          onHand.get(`${m.productId}:${m.variantId ?? 0}`) ?? 0,
          cfg.stockBuffer,
          sellable,
        )
      : sellable
        ? null // untracked: leave the marketplace stock alone
        : 0;
    return { mapping: m, price, stock };
  });
}

/**
 * Push price / stock differences of one channel. Returns counts; problems are logged once per
 * distinct error (not every 10 s).
 */
export async function syncChannelStock(
  channelId: number,
  opts: { productIds?: number[]; force?: boolean } = {},
) {
  const ch = await channelById(channelId);
  if (!ch || channelState(ch) !== "connected")
    return { updated: 0, failed: 0, skipped: "not connected" };
  const code = ch.channelCode as MarketplaceCode;
  const cfg = requireConfig(ch, code);
  const desired = await desiredListings(ch, cfg, opts.productIds);
  const changes = desired.filter(
    (d) =>
      opts.force ||
      d.mapping.channelPrice === null ||
      Number(d.mapping.channelPrice) !== d.price ||
      (d.stock !== null && d.mapping.channelStock !== d.stock),
  );
  if (changes.length === 0) return { updated: 0, failed: 0 };
  const updates: ListingUpdate[] = changes.map((d) => ({
    itemId: d.mapping.channelProductId!,
    modelId: d.mapping.channelModelId,
    sku: d.mapping.channelSku ?? String(d.mapping.id),
    ...(opts.force || d.mapping.channelPrice === null || Number(d.mapping.channelPrice) !== d.price
      ? { price: d.price }
      : {}),
    ...(d.stock !== null && (opts.force || d.mapping.channelStock !== d.stock)
      ? { stock: d.stock }
      : {}),
  }));
  let results: { sku: string; ok: boolean; error?: string }[];
  try {
    results = await withShop(ch, (ctx) => connectorFor(code).updateListings(ctx, updates));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const changed = ch.lastError !== message && !ch.lastError?.startsWith("AUTH:");
    if (e instanceof MarketplaceError && e.kind !== "auth" && changed) {
      await getPrisma().channelConnection.update({
        where: { id: ch.id },
        data: { lastError: message.slice(0, 2000) },
      });
      await logSync({
        channelId,
        syncType: "stock",
        direction: "push",
        status: "failed",
        message: `Cập nhật giá / tồn ${MARKETPLACE_NAME[code]} lỗi: ${message}`,
        details: { listings: updates.length },
      });
    }
    if (e instanceof MarketplaceError && e.retryable)
      return { updated: 0, failed: updates.length, retry: true };
    throw asBizError(e);
  }
  if (ch.lastError && !ch.lastError.startsWith("AUTH:"))
    await getPrisma().channelConnection.update({ where: { id: ch.id }, data: { lastError: null } });

  const prisma = getPrisma();
  const now = new Date();
  let updated = 0;
  const failures: string[] = [];
  for (const d of changes) {
    const sku = d.mapping.channelSku ?? String(d.mapping.id);
    const r = results.find((x) => x.sku === sku);
    if (r?.ok) {
      updated++;
      await prisma.channelProductMapping.update({
        where: { id: d.mapping.id },
        data: {
          channelPrice: d.price,
          ...(d.stock !== null ? { channelStock: d.stock } : {}),
          syncStatus: "synced",
          lastError: null,
          lastSyncAt: now,
        },
      });
    } else {
      const error = (r?.error ?? "Sàn không xác nhận cập nhật").slice(0, 2000);
      if (d.mapping.lastError !== error) failures.push(`${sku}: ${error}`);
      await prisma.channelProductMapping.update({
        where: { id: d.mapping.id },
        data: { syncStatus: "error", lastError: error },
      });
    }
  }
  if (updated)
    await logSync({
      channelId,
      syncType: "stock",
      direction: "push",
      status: failures.length ? "partial" : "success",
      message: `Cập nhật giá / tồn ${updated} SKU lên ${MARKETPLACE_NAME[code]}`,
      details: {
        skus: changes
          .filter((d) => results.find((r) => r.sku === (d.mapping.channelSku ?? "") && r.ok))
          .slice(0, 50)
          .map((d) => ({ sku: d.mapping.channelSku, price: d.price, stock: d.stock })),
      },
    });
  if (failures.length)
    await reportSyncFailure({
      channelId,
      channelName: MARKETPLACE_NAME[code],
      syncType: "stock",
      direction: "push",
      message: `${failures.length} SKU không cập nhật được giá / tồn`,
      details: { errors: failures.slice(0, 20) },
      link: `/omni/${code}`,
      dedupeKey: `omni-stock:${channelId}:${failures.join("|").slice(0, 120)}`,
    });
  return { updated, failed: changes.length - updated };
}

/** Scheduler entry: every connected marketplace channel with auto sync on */
export async function syncAllChannelStock() {
  const rows = await getPrisma().channelConnection.findMany({
    where: {
      channelCode: { in: ["shopee", "lazada"] },
      isActive: true,
      accessToken: { not: null },
    },
  });
  const out: Record<string, unknown> = {};
  for (const ch of rows) {
    const cfg = requireConfigOrNull(ch);
    if (!cfg?.autoSyncStock) continue;
    const lockKey = `omni:stock:${currentTenantId()}:${ch.id}`;
    const lock = await getRedis().set(lockKey, "1", "PX", 60_000, "NX");
    if (!lock) continue;
    try {
      out[ch.channelCode] = await syncChannelStock(ch.id);
    } catch (e) {
      out[ch.channelCode] = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      await getRedis()
        .del(lockKey)
        .catch(() => undefined);
    }
  }
  return out;
}
