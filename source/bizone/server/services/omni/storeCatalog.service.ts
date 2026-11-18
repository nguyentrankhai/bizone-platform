import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { PAYMENT_METHOD_LABEL, productSlug } from "@/lib/omni/website";
import { branchWarehouseId } from "@/server/services/invoice.service";
import { applyPromotions } from "@/lib/pos/promotions";
import { loadCartLines, loadPromoContext } from "@/server/services/pricing.service";
import type { StoreChannel } from "./websiteChannel.service";

/**
 * Store API — catalog (P6.1). Products, prices and stock are read live from BizOne, so the
 * website always shows the current stock of the channel's warehouse (SRS-OMNI-04 < 30 s).
 * Stock shown = quantity in the first active warehouse of the channel branch (what an order
 * will take); products that don't track inventory are always available.
 */

export async function storeInfo(ch: StoreChannel) {
  const c = ch.config;
  const branch = await getPrisma().branch.findUnique({
    where: { id: c.branchId },
    select: { name: true, address: true, phone: true },
  });
  return {
    name: c.storeName,
    slug: c.slug,
    hotline: c.hotline || branch?.phone || "",
    address: branch?.address ?? "",
    shippingFee: c.shippingFee,
    freeShippingFrom: c.freeShippingFrom,
    paymentMethods: c.paymentMethods.map((m) => ({ code: m, label: PAYMENT_METHOD_LABEL[m] })),
    paymentMinutes: c.paymentMinutes,
  };
}

export async function storeCategories() {
  const rows = await getPrisma().productCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, parentId: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const counts = await getPrisma().product.groupBy({
    by: ["categoryId"],
    where: { status: "active" },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    ...r,
    productCount: counts.find((c) => c.categoryId === r.id)?._count._all ?? 0,
  }));
}

/** Category + every descendant (5 levels) */
async function categoryScope(slug: string): Promise<number[] | null> {
  const all = await getPrisma().productCategory.findMany({
    where: { isActive: true },
    select: { id: true, parentId: true, slug: true },
  });
  const root = all.find((c) => c.slug === slug);
  if (!root) return null;
  const out = [root.id];
  for (let i = 0; i < out.length; i++)
    for (const c of all) if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/** Stock per product (variantId null) and per variant in one warehouse */
async function stockOf(warehouseId: number | null, productIds: number[]) {
  const map = new Map<string, number>();
  if (!warehouseId || productIds.length === 0) return map;
  const rows = await getPrisma().inventory.findMany({
    where: { warehouseId, productId: { in: productIds } },
    select: { productId: true, variantId: true, quantity: true },
  });
  for (const r of rows) {
    const k = `${r.productId}:${r.variantId ?? 0}`;
    map.set(k, (map.get(k) ?? 0) + Number(r.quantity));
    if (r.variantId) {
      const total = `${r.productId}:all`;
      map.set(total, (map.get(total) ?? 0) + Number(r.quantity));
    }
  }
  return map;
}

function available(
  stock: Map<string, number>,
  p: { id: number; trackInventory: boolean },
  variantId: number | null,
  hasVariants: boolean,
): number | null {
  if (!p.trackInventory) return null; // unlimited
  if (variantId) return Math.max(0, Math.floor(stock.get(`${p.id}:${variantId}`) ?? 0));
  const key = hasVariants ? `${p.id}:all` : `${p.id}:0`;
  return Math.max(0, Math.floor(stock.get(key) ?? 0));
}

/** Price after automatic promotions for one unit (flash sale shows on the card) */
async function promoPrices(items: { productId: number; variantId: number | null }[]) {
  const out = new Map<string, { price: number; label: string }>();
  if (!items.length) return out;
  const lines = await loadCartLines(items.map((i) => ({ ...i, quantity: 1, discountPercent: 0 })));
  const { lines: priced } = applyPromotions(lines, await loadPromoContext(lines, null));
  for (const l of priced) {
    const flash = l.promotions?.find((p) => p.type === "flash_sale");
    if (flash && l.promoDiscount)
      out.set(`${l.productId}:${l.variantId ?? 0}`, {
        price: Math.max(0, l.unitPrice - l.promoDiscount),
        label: flash.label,
      });
  }
  return out;
}

const SORTS = {
  newest: [{ id: "desc" }],
  price_asc: [{ sellingPrice: "asc" }, { id: "desc" }],
  price_desc: [{ sellingPrice: "desc" }, { id: "desc" }],
  name: [{ name: "asc" }],
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput[]>;

export async function storeProducts(
  ch: StoreChannel,
  input: {
    search?: string;
    category?: string;
    page: number;
    limit: number;
    sort: keyof typeof SORTS;
  },
) {
  const prisma = getPrisma();
  const where: Prisma.ProductWhereInput = { status: "active" };
  const search = input.search?.trim();
  if (search)
    where.OR = [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: search }];
  if (input.category) {
    const ids = await categoryScope(input.category);
    if (!ids) throw bizoneError("NOT_FOUND", `Danh mục "${input.category}" không tồn tại`);
    where.categoryId = { in: ids };
  }
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: SORTS[input.sort],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        unit: true,
        image: true,
        trackInventory: true,
        category: { select: { name: true, slug: true } },
        productImages: { select: { imageUrl: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        productVariants: { where: { status: "active" }, select: { id: true, sellingPrice: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);
  const warehouseId = await branchWarehouseId(ch.config.branchId);
  const stock = await stockOf(
    warehouseId,
    rows.map((r) => r.id),
  );
  const promos = await promoPrices(
    rows
      .filter((r) => r.productVariants.length === 0)
      .map((r) => ({ productId: r.id, variantId: null })),
  );
  const items = rows.map((p) => {
    const hasVariants = p.productVariants.length > 0;
    const prices = hasVariants
      ? p.productVariants.map((v) => Number(v.sellingPrice))
      : [Number(p.sellingPrice)];
    const promo = promos.get(`${p.id}:0`);
    return {
      id: p.id,
      slug: productSlug(p.id, p.name),
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      image: p.image ?? p.productImages[0]?.imageUrl ?? null,
      category: p.category,
      price: Math.min(...prices),
      maxPrice: Math.max(...prices),
      salePrice: promo?.price ?? null,
      saleLabel: promo?.label ?? null,
      hasVariants,
      stock: available(stock, p, null, hasVariants),
    };
  });
  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(total / input.limit),
  };
}

export async function storeProduct(ch: StoreChannel, id: number) {
  const p = await getPrisma().product.findFirst({
    where: { id, status: "active" },
    select: {
      id: true,
      name: true,
      sku: true,
      description: true,
      sellingPrice: true,
      unit: true,
      image: true,
      trackInventory: true,
      category: { select: { name: true, slug: true } },
      productImages: { select: { imageUrl: true }, orderBy: { sortOrder: "asc" } },
      productVariants: {
        where: { status: "active" },
        select: {
          id: true,
          sku: true,
          sellingPrice: true,
          image: true,
          productVariantAttributes: { select: { attributeName: true, attributeValue: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!p) throw bizoneError("NOT_FOUND", "Sản phẩm không tồn tại hoặc đã ngừng bán");
  const warehouseId = await branchWarehouseId(ch.config.branchId);
  const stock = await stockOf(warehouseId, [p.id]);
  const hasVariants = p.productVariants.length > 0;
  const promos = await promoPrices(
    hasVariants
      ? p.productVariants.map((v) => ({ productId: p.id, variantId: v.id }))
      : [{ productId: p.id, variantId: null }],
  );
  const images = [p.image, ...p.productImages.map((i) => i.imageUrl)].filter(
    (x, i, a): x is string => !!x && a.indexOf(x) === i,
  );
  const promo = promos.get(`${p.id}:0`);
  return {
    id: p.id,
    slug: productSlug(p.id, p.name),
    name: p.name,
    sku: p.sku,
    description: p.description,
    unit: p.unit,
    images,
    category: p.category,
    price: Number(p.sellingPrice),
    salePrice: promo?.price ?? null,
    saleLabel: promo?.label ?? null,
    stock: available(stock, p, null, hasVariants),
    variants: p.productVariants.map((v) => {
      const vp = promos.get(`${p.id}:${v.id}`);
      return {
        id: v.id,
        sku: v.sku,
        name: v.productVariantAttributes.map((a) => a.attributeValue).join(" / ") || v.sku,
        attributes: v.productVariantAttributes.map((a) => ({
          name: a.attributeName,
          value: a.attributeValue,
        })),
        price: Number(v.sellingPrice),
        salePrice: vp?.price ?? null,
        image: v.image,
        stock: available(stock, p, v.id, true),
      };
    }),
  };
}

/** Units available for each cart line (null = not tracked) */
export async function stockForLines(
  ch: StoreChannel,
  lines: { productId: number; variantId: number | null }[],
) {
  const warehouseId = await branchWarehouseId(ch.config.branchId);
  const ids = [...new Set(lines.map((l) => l.productId))];
  const [stock, products] = await Promise.all([
    stockOf(warehouseId, ids),
    getPrisma().product.findMany({
      where: { id: { in: ids } },
      select: { id: true, trackInventory: true },
    }),
  ]);
  return lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    return p ? available(stock, p, l.variantId, false) : 0;
  });
}
