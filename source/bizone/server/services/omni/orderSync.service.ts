import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import { fmtVnd } from "@/lib/notifications/template";
import {
  MARKETPLACE_NAME,
  ORDER_PREFIX,
  mapLazadaStatus,
  mapShopeeStatus,
  plannedTransition,
  type BizOrderStatus,
  type MarketplaceCode,
  type MarketplaceConfig,
} from "@/lib/omni/marketplace";
import { Prisma } from "@/generated/prisma/client";
import { branchWarehouseId } from "@/server/services/invoice.service";
import { notify } from "@/server/services/notification.service";
import { enqueueStockChanged } from "@/server/queue/inventory";
import { cancelOrderNow, completeOrderFrom } from "@/server/services/order.service";
import { releaseOrderHoldings, takeOrderStock } from "./orderFulfillment.service";
import { connectorFor } from "./marketplace/registry";
import { MarketplaceError, type MarketOrder } from "./marketplace/types";
import {
  channelById,
  channelState,
  findChannel,
  requireConfig,
  withShop,
  type ChannelRow,
} from "./marketplaceChannel.service";
import { logSync, reportSyncFailure } from "./websiteChannel.service";

/**
 * Marketplace orders → BizOne (P6.2).
 *
 * Sources: push notifications (Shopee / Lazada call `/api/webhooks/{code}` → job with the order
 * ids), polling every 2 minutes (orders updated since the last sync, 5 min overlap) and the
 * "Đồng bộ đơn" button. Orders that failed (unlinked SKU…) are kept in a Redis retry set and
 * tried again by every poll for 7 days.
 *
 * Import: one BizOne order per marketplace order (`order_channel_mapping` unique), lines matched
 * through the listing map or by SKU, stock taken at once from the channel branch's warehouse (so
 * POS / website / other marketplaces see it gone) — an order the warehouse can't cover is still
 * imported (the marketplace sold it) without taking stock, and flagged. Status changes only move
 * the order forward: cancel → stock back, completed → revenue invoice (written as the user who
 * connected the shop), returned → stock back.
 */

const RETRY_TTL = 7 * 86_400;
const retryKey = (channelId: number) => `omni:retry:${currentTenantId()}:${channelId}`;

class UnlinkedLineError extends Error {}

function targetStatus(code: MarketplaceCode, mo: MarketOrder): BizOrderStatus | null {
  return code === "shopee" ? mapShopeeStatus(mo.rawStatus) : mapLazadaStatus(mo.statuses);
}

/** Marketplace lines → BizOne product / variant (listing map first, then SKU) */
async function resolveLines(channelId: number, mo: MarketOrder) {
  const prisma = getPrisma();
  const out: {
    productId: number;
    variantId: number | null;
    name: string;
    quantity: number;
    unitPrice: number;
  }[] = [];
  const missing: string[] = [];
  for (const l of mo.lines) {
    if (l.quantity <= 0) continue;
    let hit: { productId: number; variantId: number | null } | null = null;
    if (l.itemId) {
      const m = await prisma.channelProductMapping.findFirst({
        where: {
          channelId,
          channelProductId: l.itemId,
          ...(l.modelId ? { channelModelId: l.modelId } : {}),
        },
        select: { productId: true, variantId: true, channelModelId: true },
      });
      if (m && (l.modelId || !m.channelModelId)) hit = m;
    }
    if (!hit && l.sku) {
      const v = await prisma.productVariant.findUnique({
        where: { sku: l.sku },
        select: { id: true, productId: true },
      });
      if (v) hit = { productId: v.productId, variantId: v.id };
      else {
        const p = await prisma.product.findUnique({ where: { sku: l.sku }, select: { id: true } });
        if (p) hit = { productId: p.id, variantId: null };
      }
    }
    if (!hit) missing.push(l.sku ? `${l.sku} (${l.name})` : l.name);
    else out.push({ ...hit, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice });
  }
  if (missing.length)
    throw new UnlinkedLineError(`SKU chưa liên kết với sản phẩm BizOne: ${missing.join(", ")}`);
  return out;
}

async function enoughStock(
  warehouseId: number,
  lines: { productId: number; variantId: number | null; quantity: number }[],
) {
  const prisma = getPrisma();
  const tracked = await prisma.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) }, trackInventory: true },
    select: { id: true },
  });
  const need = new Map<string, number>();
  for (const l of lines.filter((x) => tracked.some((t) => t.id === x.productId))) {
    const k = `${l.productId}:${l.variantId ?? 0}`;
    need.set(k, (need.get(k) ?? 0) + l.quantity);
  }
  for (const [k, qty] of need) {
    const [productId, variantId] = k.split(":").map(Number);
    const inv = await prisma.inventory.findFirst({
      where: { warehouseId, productId, variantId: variantId || null },
      select: { quantity: true },
    });
    if (Number(inv?.quantity ?? 0) < qty) return false;
  }
  return true;
}

const orderInclude = { orderItems: { include: { product: { select: { name: true } } } } } as const;

async function createMarketOrder(
  ch: ChannelRow,
  cfg: MarketplaceConfig,
  mo: MarketOrder,
  target: BizOrderStatus,
) {
  const code = ch.channelCode as MarketplaceCode;
  const name = MARKETPLACE_NAME[code];
  const prisma = getPrisma();
  const lines = await resolveLines(ch.id, mo);
  const warehouseId = await branchWarehouseId(cfg.branchId);
  let takeStock = !!warehouseId && (await enoughStock(warehouseId, lines));
  const subtotal = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);
  const paid = mo.rawStatus !== "UNPAID" && !mo.statuses.includes("unpaid") && !mo.isCod;

  const create = (withStock: boolean) =>
    prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            orderCode: `${ORDER_PREFIX[code]}-${mo.orderId}`.slice(0, 50),
            customerId: null,
            contactName: mo.buyerName?.slice(0, 255) ?? null,
            contactPhone: mo.phone?.slice(0, 20) ?? null,
            channel: code,
            channelOrderId: mo.orderId,
            branchId: cfg.branchId,
            subtotal,
            shippingFee: mo.shippingFee,
            discountAmount: Math.max(0, subtotal + mo.shippingFee - mo.total),
            totalAmount: mo.total,
            paymentMethod: mo.isCod ? "cod" : code,
            paymentStatus: paid ? "paid" : "unpaid",
            status: "pending",
            shippingAddress: mo.address,
            shippingProvider: mo.carrier?.slice(0, 100) ?? null,
            trackingCode: mo.trackingCode?.slice(0, 100) ?? null,
            notes: mo.note,
            createdAt: mo.createdAt,
            orderItems: {
              create: lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountAmount: 0,
                totalAmount: l.unitPrice * l.quantity,
              })),
            },
            orderTracking: {
              create: {
                status: "pending",
                note: `Nhận đơn từ ${name} (${mo.rawStatus})${withStock ? "" : " — CHƯA trừ tồn: kho không đủ hàng"}`,
              },
            },
            orderChannelMapping: {
              create: {
                channelId: ch.id,
                channelOrderId: mo.orderId,
                channelStatus: mo.rawStatus.slice(0, 50),
                channelUpdatedAt: mo.updatedAt,
                channelOrderData: JSON.stringify({
                  paymentMethod: mo.paymentMethod,
                  lines: mo.lines.map((l) => ({
                    itemId: l.itemId,
                    modelId: l.modelId,
                    sku: l.sku,
                    qty: l.quantity,
                  })),
                }).slice(0, 60_000),
              },
            },
          },
          include: orderInclude,
        });
        const moved =
          withStock && warehouseId ? await takeOrderStock(tx, order, warehouseId, null) : [];
        return { order, moved };
      },
      { timeout: 15_000 },
    );

  let created: Awaited<ReturnType<typeof create>>;
  try {
    created = await create(takeStock);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // imported concurrently
    if (!takeStock || !(e instanceof Error) || !/không đủ/i.test(e.message)) throw e;
    takeStock = false; // stock moved between the check and the transaction
    created = await create(false);
  }
  const { order, moved } = created;
  if (moved.length && warehouseId)
    await enqueueStockChanged({
      warehouseId,
      productIds: moved,
      reason: "order",
      orderId: order.id,
    });
  await logSync({
    channelId: ch.id,
    syncType: "order",
    direction: "pull",
    status: takeStock ? "success" : "partial",
    message: `Nhận đơn ${order.orderCode} (${fmtVnd(String(mo.total))})${takeStock ? "" : " — kho không đủ hàng, chưa trừ tồn"}`,
    details: {
      orderId: order.id,
      channelOrderId: mo.orderId,
      status: mo.rawStatus,
      items: lines.length,
    },
  });
  if (target !== "cancelled")
    await notify({
      type: "order_new",
      title: `Đơn hàng ${order.orderCode} từ ${name} - ${fmtVnd(String(mo.total))}`,
      content: mo.buyerName ? `Khách ${mo.buyerName}` : null,
      link: `/orders/${order.id}`,
      branchId: cfg.branchId,
      dedupeKey: `order:${order.id}`,
      vars: {
        order_code: order.orderCode,
        channel: name,
        customer_name: mo.buyerName ?? "Khách sàn",
        total_amount: fmtVnd(String(mo.total)),
        branch_name: "",
      },
    });
  if (!takeStock)
    await reportSyncFailure({
      channelId: ch.id,
      channelName: name,
      syncType: "order",
      direction: "pull",
      message: `Đơn ${order.orderCode}: kho không đủ hàng (sàn đã bán) — kiểm tra tồn kho`,
      details: { orderId: order.id },
      link: `/orders/${order.id}`,
      branchId: cfg.branchId,
      dedupeKey: `omni-oversold:${order.id}`,
    });
  return order;
}

/** Apply the marketplace status to an imported order (forward only) */
async function applyStatus(
  ch: ChannelRow,
  orderId: number,
  mo: MarketOrder,
  target: BizOrderStatus | null,
) {
  const code = ch.channelCode as MarketplaceCode;
  const name = MARKETPLACE_NAME[code];
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const current = order.status as BizOrderStatus;
  const plan = plannedTransition(current, target);
  const note = `${name}: ${mo.rawStatus}`;
  const paidNow =
    order.paymentStatus !== "paid" && !mo.isCod && target !== "pending" && target !== "cancelled";
  const info = {
    ...(mo.carrier && !order.shippingProvider
      ? { shippingProvider: mo.carrier.slice(0, 100) }
      : {}),
    ...(mo.trackingCode && mo.trackingCode !== order.trackingCode
      ? { trackingCode: mo.trackingCode.slice(0, 100) }
      : {}),
    ...(paidNow ? { paymentStatus: "paid" as const } : {}),
  };
  if (Object.keys(info).length && plan !== "complete")
    await prisma.order.update({ where: { id: orderId }, data: info });

  switch (plan) {
    case "none":
      return "unchanged";
    case "advance": {
      const res = await prisma.order.updateMany({
        where: { id: orderId, status: current },
        data: { status: target! },
      });
      if (res.count)
        await prisma.orderTracking.create({ data: { orderId, status: target!, note } });
      return target!;
    }
    case "cancel":
      await cancelOrderNow(orderId, `Đơn bị huỷ trên ${name}`, null);
      return "cancelled";
    case "return": {
      const full = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: orderInclude,
      });
      const released = await prisma.$transaction(async (tx) => {
        const res = await tx.order.updateMany({
          where: { id: orderId, status: current },
          data: { status: "returned" },
        });
        if (res.count === 0) return null;
        await tx.orderTracking.create({
          data: { orderId, status: "returned", note: `${note} — hàng hoàn về kho` },
        });
        return releaseOrderHoldings(tx, full, null, "return");
      });
      if (released?.warehouseId && released.productIds.length)
        await enqueueStockChanged({
          warehouseId: released.warehouseId,
          productIds: released.productIds,
          reason: "cancel",
          orderId,
        });
      return "returned";
    }
    case "complete": {
      if (!ch.connectedBy) {
        await reportSyncFailure({
          channelId: ch.id,
          channelName: name,
          syncType: "order",
          direction: "pull",
          message: `Đơn ${order.orderCode} đã hoàn thành trên ${name} nhưng không ghi được hoá đơn: chưa xác định người kết nối shop — kết nối lại`,
          link: `/orders/${orderId}`,
          dedupeKey: `omni-complete:${orderId}`,
        });
        return "unchanged";
      }
      if (Object.keys(info).length)
        await prisma.order.update({ where: { id: orderId }, data: info });
      await completeOrderFrom(orderId, `${note} — hoá đơn doanh thu tự ghi`, ch.connectedBy, [
        "pending",
        "confirmed",
        "preparing",
        "shipping",
        "delivered",
      ]);
      return "completed";
    }
    case "manual":
      await reportSyncFailure({
        channelId: ch.id,
        channelName: name,
        syncType: "order",
        direction: "pull",
        message: `Đơn ${order.orderCode} bị trả hàng trên ${name} sau khi đã hoàn thành — xử lý hoàn trả thủ công`,
        details: { status: mo.rawStatus },
        link: `/orders/${orderId}`,
        branchId: order.branchId,
        dedupeKey: `omni-return:${orderId}`,
      });
      return "manual";
  }
}

/** Create or update the BizOne order of one marketplace order */
export async function upsertMarketOrder(ch: ChannelRow, cfg: MarketplaceConfig, mo: MarketOrder) {
  const code = ch.channelCode as MarketplaceCode;
  const prisma = getPrisma();
  const target = targetStatus(code, mo);
  let mapping = await prisma.orderChannelMapping.findUnique({
    where: { channelId_channelOrderId: { channelId: ch.id, channelOrderId: mo.orderId } },
  });
  if (!mapping) {
    if (target === "cancelled") return { orderId: null, result: "skipped" as const }; // never seen, already cancelled
    const created = await createMarketOrder(ch, cfg, mo, target ?? "pending");
    mapping = await prisma.orderChannelMapping.findUnique({
      where: { channelId_channelOrderId: { channelId: ch.id, channelOrderId: mo.orderId } },
    });
    if (!mapping) throw new Error(`Không tạo được đơn cho ${mo.orderId}`);
    const result = await applyStatus(ch, mapping.orderId, mo, target);
    return {
      orderId: mapping.orderId,
      result: created ? ("created" as const) : (result as string),
    };
  }
  if (
    mapping.channelStatus === mo.rawStatus.slice(0, 50) &&
    mapping.channelUpdatedAt &&
    mo.updatedAt.getTime() <= mapping.channelUpdatedAt.getTime()
  )
    return { orderId: mapping.orderId, result: "unchanged" as const };
  const result = await applyStatus(ch, mapping.orderId, mo, target);
  await prisma.orderChannelMapping.update({
    where: { id: mapping.id },
    data: { channelStatus: mo.rawStatus.slice(0, 50), channelUpdatedAt: mo.updatedAt },
  });
  return { orderId: mapping.orderId, result };
}

/** Fetch + apply marketplace orders by id. Failures go to the retry set */
export async function importOrders(channelId: number, ids: string[]) {
  const ch = await channelById(channelId);
  if (!ch || channelState(ch) !== "connected" || ids.length === 0)
    return { imported: 0, failed: 0 };
  const code = ch.channelCode as MarketplaceCode;
  const cfg = requireConfig(ch, code);
  const orders = await withShop(ch, (ctx) => connectorFor(code).getOrders(ctx, ids));
  const redis = getRedis();
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  for (const mo of orders) {
    try {
      const r = await upsertMarketOrder(ch, cfg, mo);
      if (r.result === "created") summary.created++;
      else if (r.result === "unchanged") summary.unchanged++;
      else if (r.result === "skipped") summary.skipped++;
      else summary.updated++;
      await redis.srem(retryKey(channelId), mo.orderId).catch(() => undefined);
    } catch (e) {
      summary.failed++;
      const message = e instanceof Error ? e.message : String(e);
      const key = retryKey(channelId);
      const isNew = await redis.sadd(key, mo.orderId).catch(() => 0);
      await redis.expire(key, RETRY_TTL).catch(() => undefined);
      if (isNew)
        await reportSyncFailure({
          channelId,
          channelName: MARKETPLACE_NAME[code],
          syncType: "order",
          direction: "pull",
          message: `Không nhận được đơn ${mo.orderId}: ${message}`,
          details: {
            channelOrderId: mo.orderId,
            status: mo.rawStatus,
            retry: "tự thử lại mỗi 2 phút (7 ngày)",
          },
          link: `/omni/${code}`,
          dedupeKey: `omni-order:${channelId}:${mo.orderId}`,
        });
      if (!(e instanceof UnlinkedLineError)) console.error(`[omni] order ${code}:${mo.orderId}`, e);
    }
  }
  return summary;
}

/** Poll orders updated since the last sync (plus the retry set) */
export async function pollOrders(channelId: number, opts: { manual?: boolean } = {}) {
  const ch = await channelById(channelId);
  if (!ch || channelState(ch) !== "connected") return { skipped: "not connected" };
  const code = ch.channelCode as MarketplaceCode;
  const cfg = requireConfig(ch, code);
  if (!opts.manual && !cfg.autoImportOrders) return { skipped: "auto import off" };
  const lockKey = `omni:poll:${currentTenantId()}:${channelId}`;
  const redis = getRedis();
  if (!(await redis.set(lockKey, "1", "PX", 5 * 60_000, "NX"))) return { skipped: "running" };
  try {
    const to = new Date();
    const from = new Date(
      Math.max(
        (ch.lastOrderSyncAt?.getTime() ?? to.getTime() - 86_400_000) - 5 * 60_000,
        to.getTime() - 30 * 86_400_000,
      ),
    );
    const ids = await withShop(ch, (ctx) => connectorFor(code).listOrderIds(ctx, from, to));
    const retry = await redis.smembers(retryKey(channelId)).catch(() => [] as string[]);
    const all = [...new Set([...ids, ...retry])];
    const summary = all.length
      ? await importOrders(channelId, all)
      : { created: 0, updated: 0, failed: 0 };
    await getPrisma().channelConnection.update({
      where: { id: channelId },
      data: { lastOrderSyncAt: to },
    });
    if (opts.manual)
      await logSync({
        channelId,
        syncType: "order",
        direction: "pull",
        status: "success",
        message: `Đồng bộ đơn ${MARKETPLACE_NAME[code]}: ${all.length} đơn cập nhật`,
        details: { from: from.toISOString(), to: to.toISOString(), ...summary },
      });
    return { found: all.length, ...summary };
  } catch (e) {
    if (e instanceof MarketplaceError && opts.manual)
      await logSync({
        channelId,
        syncType: "order",
        direction: "pull",
        status: "failed",
        message: `Đồng bộ đơn ${MARKETPLACE_NAME[code]} lỗi: ${e.message}`,
      });
    throw e;
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
}

/** Scheduler: poll every connected marketplace channel */
export async function pollAllChannels() {
  const rows = await getPrisma().channelConnection.findMany({
    where: {
      channelCode: { in: ["shopee", "lazada"] },
      isActive: true,
      accessToken: { not: null },
    },
    select: { id: true, channelCode: true },
  });
  const out: Record<string, unknown> = {};
  for (const ch of rows) {
    try {
      out[ch.channelCode] = await pollOrders(ch.id);
    } catch (e) {
      out[ch.channelCode] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

/** Admin "Đồng bộ đơn" — returns the channel id to enqueue */
export async function requireConnectedChannel(code: MarketplaceCode) {
  const ch = await findChannel(code);
  if (!ch || channelState(ch) !== "connected")
    throw bizoneError("CONFLICT", `${MARKETPLACE_NAME[code]} chưa kết nối hoặc đang tạm ngừng`);
  requireConfig(ch, code);
  return ch.id;
}
