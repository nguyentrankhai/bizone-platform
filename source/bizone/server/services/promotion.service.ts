import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { vnDateKeyRange } from "@/lib/vn-time";
import type { Prisma } from "@/generated/prisma/client";
import type {
  BuyXGetYInput,
  ComboInput,
  CreateFlashSaleInput,
  FlashItemInput,
  ListFlashSalesInput,
  MarketingReportInput,
  UpdateFlashSaleInput,
} from "@/lib/validators/marketing";

const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);
const n = (v: Prisma.Decimal | number | bigint | null | undefined) => Number(v ?? 0);

type FlashStatus = "scheduled" | "active" | "ended" | "cancelled";

/** Status by the clock (cancelled is sticky) — pricing uses the times, not the stored column */
export function flashStatus(
  f: { status: FlashStatus; startTime: Date; endTime: Date },
  now = new Date(),
): FlashStatus {
  if (f.status === "cancelled") return "cancelled";
  if (now < f.startTime) return "scheduled";
  if (now < f.endTime) return "active";
  return "ended";
}

/**
 * Flash sales start and end by themselves: the POS prices by start/end time; this keeps the
 * stored `status` column in step (called before every read).
 */
export async function syncFlashSaleStatuses(now = new Date()) {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.flashSale.updateMany({
      where: { status: { in: ["scheduled", "active"] }, endTime: { lte: now } },
      data: { status: "ended" },
    }),
    prisma.flashSale.updateMany({
      where: { status: "scheduled", startTime: { lte: now }, endTime: { gt: now } },
      data: { status: "active" },
    }),
  ]);
}

// ─── Product helpers ────────────────────────────────────────────────────────

async function productPrices(items: { productId: number; variantId?: number | null }[]) {
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      sellingPrice: true,
      productVariants: { select: { id: true, sku: true, sellingPrice: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return (item: { productId: number; variantId?: number | null }) => {
    const p = byId.get(item.productId);
    if (!p) throw notFound(`Sản phẩm #${item.productId} không tồn tại`);
    if (p.status !== "active") throw invalid(`"${p.name}" đang ngừng bán`);
    if (item.variantId) {
      const v = p.productVariants.find((x) => x.id === item.variantId);
      if (!v) throw invalid(`Biến thể #${item.variantId} không thuộc "${p.name}"`);
      return { name: `${p.name} (${v.sku})`, price: n(v.sellingPrice) || n(p.sellingPrice) };
    }
    return { name: p.name, price: n(p.sellingPrice) };
  };
}

// ─── Flash sales ────────────────────────────────────────────────────────────

async function assertFlashItems(input: CreateFlashSaleInput, exceptId?: number) {
  const priceOf = await productPrices(input.items);
  for (const item of input.items) {
    const { name, price } = priceOf(item);
    if (item.flashPrice >= price) {
      throw invalid(
        `Giá flash của "${name}" phải thấp hơn giá bán ${price.toLocaleString("vi-VN")}₫`,
      );
    }
    if (
      item.perCustomerLimit > 0 &&
      item.quantityLimit > 0 &&
      item.perCustomerLimit > item.quantityLimit
    ) {
      throw invalid(`"${name}": giới hạn mỗi khách lớn hơn tổng suất`);
    }
  }
  // The same product can't be in two flash sales that overlap in time
  const clash = await getPrisma().flashSaleProduct.findFirst({
    where: {
      productId: { in: input.items.map((i) => i.productId) },
      flashSale: {
        status: { not: "cancelled" },
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    },
    include: { flashSale: { select: { name: true } }, product: { select: { name: true } } },
  });
  if (clash)
    throw conflict(
      `"${clash.product.name}" đã có trong flash sale "${clash.flashSale.name}" trùng thời gian`,
    );
}

const itemRows = (items: FlashItemInput[]) =>
  items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    flashPrice: i.flashPrice,
    quantityLimit: i.quantityLimit,
    perCustomerLimit: i.perCustomerLimit,
  }));

export async function listFlashSales(input: ListFlashSalesInput) {
  await syncFlashSaleStatuses();
  const prisma = getPrisma();
  const where: Prisma.FlashSaleWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { name: { contains: input.search } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.flashSale.findMany({
      where,
      orderBy: [{ startTime: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { flashSaleProducts: { select: { quantityLimit: true, soldQuantity: true } } },
    }),
    prisma.flashSale.count({ where }),
  ]);
  return {
    items: rows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      startTime: f.startTime,
      endTime: f.endTime,
      status: flashStatus(f),
      productCount: f.flashSaleProducts.length,
      sold: f.flashSaleProducts.reduce((s, p) => s + p.soldQuantity, 0),
      limit: f.flashSaleProducts.every((p) => p.quantityLimit > 0)
        ? f.flashSaleProducts.reduce((s, p) => s + p.quantityLimit, 0)
        : null,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getFlashSale(id: number) {
  await syncFlashSaleStatuses();
  const f = await getPrisma().flashSale.findUnique({
    where: { id },
    include: {
      flashSaleProducts: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { id: true, name: true, sku: true, sellingPrice: true, unit: true } },
          variant: { select: { id: true, sku: true, sellingPrice: true } },
        },
      },
    },
  });
  if (!f) throw notFound(`Flash sale #${id} không tồn tại`);
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    startTime: f.startTime,
    endTime: f.endTime,
    status: flashStatus(f),
    items: f.flashSaleProducts.map((p) => ({
      id: p.id,
      product: {
        id: p.product.id,
        name: p.product.name,
        sku: p.variant?.sku ?? p.product.sku,
        unit: p.product.unit,
      },
      variantId: p.variantId,
      regularPrice: n(p.variant?.sellingPrice) || n(p.product.sellingPrice),
      flashPrice: n(p.flashPrice),
      quantityLimit: p.quantityLimit,
      perCustomerLimit: p.perCustomerLimit,
      soldQuantity: p.soldQuantity,
    })),
  };
}

export async function createFlashSale(input: CreateFlashSaleInput, userId: number | null) {
  if (input.endTime <= new Date()) throw invalid("Thời gian kết thúc đã qua");
  await assertFlashItems(input);
  return getPrisma().flashSale.create({
    data: {
      name: input.name,
      description: input.description || null,
      startTime: input.startTime,
      endTime: input.endTime,
      status: flashStatus({
        status: "scheduled",
        startTime: input.startTime,
        endTime: input.endTime,
      }),
      createdBy: userId,
      flashSaleProducts: { create: itemRows(input.items) },
    },
    select: { id: true, name: true },
  });
}

/** Only a flash sale that hasn't started can be edited; a running one can be ended / cancelled */
export async function updateFlashSale({ id, data }: UpdateFlashSaleInput) {
  const prisma = getPrisma();
  const f = await prisma.flashSale.findUnique({ where: { id } });
  if (!f) throw notFound(`Flash sale #${id} không tồn tại`);
  if (flashStatus(f) !== "scheduled") throw conflict("Chỉ sửa được flash sale chưa bắt đầu");
  if (data.endTime <= new Date()) throw invalid("Thời gian kết thúc đã qua");
  await assertFlashItems(data, id);
  return prisma.$transaction(async (tx) => {
    await tx.flashSaleProduct.deleteMany({ where: { flashSaleId: id } });
    return tx.flashSale.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        startTime: data.startTime,
        endTime: data.endTime,
        status: flashStatus({
          status: "scheduled",
          startTime: data.startTime,
          endTime: data.endTime,
        }),
        flashSaleProducts: { create: itemRows(data.items) },
      },
      select: { id: true, name: true },
    });
  });
}

/** End a running flash sale now (prices return to normal on the next POS quote) */
export async function endFlashSale(id: number) {
  const prisma = getPrisma();
  const f = await prisma.flashSale.findUnique({ where: { id } });
  if (!f) throw notFound(`Flash sale #${id} không tồn tại`);
  if (flashStatus(f) !== "active") throw conflict("Flash sale không đang chạy");
  return prisma.flashSale.update({
    where: { id },
    data: { endTime: new Date(), status: "ended" },
    select: { id: true, status: true },
  });
}

export async function cancelFlashSale(id: number) {
  const prisma = getPrisma();
  const f = await prisma.flashSale.findUnique({ where: { id } });
  if (!f) throw notFound(`Flash sale #${id} không tồn tại`);
  const st = flashStatus(f);
  if (st === "ended" || st === "cancelled") throw conflict("Flash sale đã kết thúc hoặc đã huỷ");
  return prisma.flashSale.update({
    where: { id },
    data: { status: "cancelled" },
    select: { id: true, status: true },
  });
}

// ─── Buy X get Y ────────────────────────────────────────────────────────────

async function assertBxgyRefs(r: BuyXGetYInput) {
  const prisma = getPrisma();
  const productIds = [r.buyProductId, r.getProductId].filter((x): x is number => !!x);
  const categoryIds = [r.buyCategoryId, r.getCategoryId].filter((x): x is number => !!x);
  const [p, c] = await Promise.all([
    prisma.product.count({ where: { id: { in: productIds }, status: "active" } }),
    prisma.productCategory.count({ where: { id: { in: categoryIds } } }),
  ]);
  if (p !== new Set(productIds).size) throw notFound("Sản phẩm không tồn tại hoặc ngừng bán");
  if (c !== new Set(categoryIds).size) throw notFound("Danh mục không tồn tại");
}

const bxgyData = (r: BuyXGetYInput) => ({
  name: r.name,
  buyProductId: r.buyProductId ?? null,
  buyCategoryId: r.buyCategoryId ?? null,
  buyQuantity: r.buyQuantity,
  getProductId: r.getProductId ?? null,
  getCategoryId: r.getCategoryId ?? null,
  getQuantity: r.getQuantity,
  getDiscountPercent: r.getDiscountPercent,
  startDate: r.startDate,
  endDate: r.endDate,
  isActive: r.isActive,
});

async function usageStats(type: "buy_x_get_y" | "combo" | "flash_sale", ids: number[]) {
  if (!ids.length) return new Map<number, { uses: number; quantity: number; discount: number }>();
  const rows = await getPrisma().promotionUsage.groupBy({
    by: ["promotionId"],
    where: { promotionType: type, promotionId: { in: ids } },
    _count: { _all: true },
    _sum: { quantity: true, discountAmount: true },
  });
  return new Map(
    rows.map((r) => [
      r.promotionId,
      { uses: r._count._all, quantity: r._sum.quantity ?? 0, discount: n(r._sum.discountAmount) },
    ]),
  );
}

export async function listBuyXGetY() {
  const rows = await getPrisma().promotionBuyXGetY.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      buyProduct: { select: { id: true, name: true } },
      buyCategory: { select: { id: true, name: true } },
      getProduct: { select: { id: true, name: true } },
      getCategory: { select: { id: true, name: true } },
    },
  });
  const stats = await usageStats(
    "buy_x_get_y",
    rows.map((r) => r.id),
  );
  const now = new Date();
  return rows.map((r) => ({
    ...r,
    getDiscountPercent: n(r.getDiscountPercent),
    running: r.isActive && r.startDate <= now && r.endDate > now,
    stats: stats.get(r.id) ?? { uses: 0, quantity: 0, discount: 0 },
  }));
}

export async function createBuyXGetY(input: BuyXGetYInput, userId: number | null) {
  await assertBxgyRefs(input);
  return getPrisma().promotionBuyXGetY.create({
    data: { ...bxgyData(input), createdBy: userId },
    select: { id: true, name: true },
  });
}

export async function updateBuyXGetY(id: number, input: BuyXGetYInput) {
  const exists = await getPrisma().promotionBuyXGetY.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw notFound(`Chương trình #${id} không tồn tại`);
  await assertBxgyRefs(input);
  return getPrisma().promotionBuyXGetY.update({
    where: { id },
    data: bxgyData(input),
    select: { id: true, name: true },
  });
}

export async function toggleBuyXGetY(id: number, isActive: boolean) {
  const r = await getPrisma().promotionBuyXGetY.updateMany({ where: { id }, data: { isActive } });
  if (!r.count) throw notFound(`Chương trình #${id} không tồn tại`);
  return { id, isActive };
}

export async function deleteBuyXGetY(id: number) {
  const used = await getPrisma().promotionUsage.count({
    where: { promotionType: "buy_x_get_y", promotionId: id },
  });
  if (used) throw conflict("Chương trình đã được áp dụng cho hoá đơn — chỉ có thể tắt");
  const r = await getPrisma().promotionBuyXGetY.deleteMany({ where: { id } });
  if (!r.count) throw notFound(`Chương trình #${id} không tồn tại`);
  return { id };
}

// ─── Combos ─────────────────────────────────────────────────────────────────

async function comboOriginal(items: ComboInput["items"]) {
  const priceOf = await productPrices(items);
  return items.reduce((s, i) => s + priceOf(i).price * i.quantity, 0);
}

export async function listCombos() {
  const rows = await getPrisma().promotionCombo.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      promotionComboItems: {
        include: { product: { select: { id: true, name: true, sku: true, sellingPrice: true } } },
      },
    },
  });
  const stats = await usageStats(
    "combo",
    rows.map((r) => r.id),
  );
  const now = new Date();
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    comboPrice: n(c.comboPrice),
    originalPrice: n(c.originalPrice),
    startDate: c.startDate,
    endDate: c.endDate,
    quantityLimit: c.quantityLimit,
    soldCount: c.soldCount,
    isActive: c.isActive,
    running:
      c.isActive &&
      (!c.startDate || c.startDate <= now) &&
      (!c.endDate || c.endDate > now) &&
      (c.quantityLimit === 0 || c.soldCount < c.quantityLimit),
    items: c.promotionComboItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      name: i.product.name,
      sku: i.product.sku,
      price: n(i.product.sellingPrice),
    })),
    stats: stats.get(c.id) ?? { uses: 0, quantity: 0, discount: 0 },
  }));
}

export async function createCombo(input: ComboInput, userId: number | null) {
  const original = await comboOriginal(input.items);
  if (input.comboPrice >= original)
    throw invalid(`Giá combo phải thấp hơn tổng giá lẻ ${original.toLocaleString("vi-VN")}₫`);
  return getPrisma().promotionCombo.create({
    data: {
      name: input.name,
      comboPrice: input.comboPrice,
      originalPrice: original,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      quantityLimit: input.quantityLimit,
      isActive: input.isActive,
      createdBy: userId,
      promotionComboItems: { create: input.items },
    },
    select: { id: true, name: true },
  });
}

export async function updateCombo(id: number, input: ComboInput) {
  const prisma = getPrisma();
  const c = await prisma.promotionCombo.findUnique({ where: { id } });
  if (!c) throw notFound(`Combo #${id} không tồn tại`);
  if (input.quantityLimit > 0 && input.quantityLimit < c.soldCount)
    throw invalid(`Giới hạn suất không được nhỏ hơn số đã bán (${c.soldCount})`);
  const original = await comboOriginal(input.items);
  if (input.comboPrice >= original)
    throw invalid(`Giá combo phải thấp hơn tổng giá lẻ ${original.toLocaleString("vi-VN")}₫`);
  return prisma.$transaction(async (tx) => {
    await tx.promotionComboItem.deleteMany({ where: { comboId: id } });
    return tx.promotionCombo.update({
      where: { id },
      data: {
        name: input.name,
        comboPrice: input.comboPrice,
        originalPrice: original,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        quantityLimit: input.quantityLimit,
        isActive: input.isActive,
        promotionComboItems: { create: input.items },
      },
      select: { id: true, name: true },
    });
  });
}

export async function toggleCombo(id: number, isActive: boolean) {
  const r = await getPrisma().promotionCombo.updateMany({ where: { id }, data: { isActive } });
  if (!r.count) throw notFound(`Combo #${id} không tồn tại`);
  return { id, isActive };
}

export async function deleteCombo(id: number) {
  const prisma = getPrisma();
  const c = await prisma.promotionCombo.findUnique({ where: { id }, select: { soldCount: true } });
  if (!c) throw notFound(`Combo #${id} không tồn tại`);
  const used = await prisma.promotionUsage.count({
    where: { promotionType: "combo", promotionId: id },
  });
  if (used || c.soldCount) throw conflict("Combo đã bán — chỉ có thể tắt");
  await prisma.promotionCombo.delete({ where: { id } });
  return { id };
}

// ─── Effectiveness report ───────────────────────────────────────────────────

/**
 * Per promotion over a VN date range: number of invoices, units / sets / gifts, discount given,
 * revenue of those invoices and average order value. Cancelled invoices drop out (their usage
 * rows are deleted on cancel); refunded invoices stay at their original amount.
 */
export async function marketingReport(input: MarketingReportInput) {
  const prisma = getPrisma();
  const { start, end } = vnDateKeyRange(input.from, input.to);

  const coupons = await prisma.$queryRaw<
    {
      id: number;
      code: string;
      name: string;
      uses: bigint;
      discount: unknown;
      revenue: unknown;
      customers: bigint;
    }[]
  >`
    SELECT c.id, c.code, c.name, COUNT(*) AS uses, SUM(cu.discount_amount) AS discount,
           SUM(i.total_amount) AS revenue, COUNT(DISTINCT cu.customer_id) AS customers
      FROM coupon_usage cu
      JOIN coupons c ON c.id = cu.coupon_id
      JOIN invoices i ON i.id = cu.invoice_id AND i.status <> 'cancelled'
     WHERE cu.used_at >= ${start} AND cu.used_at < ${end}
     GROUP BY c.id, c.code, c.name
     ORDER BY discount DESC`;

  const promos = await prisma.$queryRaw<
    {
      type: string;
      promotion_id: number;
      invoices: bigint;
      quantity: unknown;
      discount: unknown;
      revenue: unknown;
    }[]
  >`
    SELECT pu.promotion_type AS type, pu.promotion_id, COUNT(DISTINCT pu.invoice_id) AS invoices,
           SUM(pu.quantity) AS quantity, SUM(pu.discount_amount) AS discount,
           (SELECT SUM(i2.total_amount) FROM invoices i2
             WHERE i2.id IN (SELECT DISTINCT p2.invoice_id FROM promotion_usage p2
                              WHERE p2.promotion_type = pu.promotion_type AND p2.promotion_id = pu.promotion_id
                                AND p2.used_at >= ${start} AND p2.used_at < ${end})
               AND i2.status <> 'cancelled') AS revenue
      FROM promotion_usage pu
      JOIN invoices i ON i.id = pu.invoice_id AND i.status <> 'cancelled'
     WHERE pu.used_at >= ${start} AND pu.used_at < ${end}
     GROUP BY pu.promotion_type, pu.promotion_id
     ORDER BY discount DESC`;

  const ids = (t: string) => promos.filter((p) => p.type === t).map((p) => p.promotion_id);
  const [flash, bxgy, combos] = await Promise.all([
    prisma.flashSale.findMany({
      where: { id: { in: ids("flash_sale") } },
      select: { id: true, name: true },
    }),
    prisma.promotionBuyXGetY.findMany({
      where: { id: { in: ids("buy_x_get_y") } },
      select: { id: true, name: true },
    }),
    prisma.promotionCombo.findMany({
      where: { id: { in: ids("combo") } },
      select: { id: true, name: true },
    }),
  ]);
  const names = new Map<string, string>([
    ...flash.map((f) => [`flash_sale:${f.id}`, f.name] as [string, string]),
    ...bxgy.map((f) => [`buy_x_get_y:${f.id}`, f.name] as [string, string]),
    ...combos.map((f) => [`combo:${f.id}`, f.name] as [string, string]),
  ]);

  const rows = [
    ...coupons.map((c) => ({
      type: "coupon" as const,
      id: c.id,
      name: `${c.code} — ${c.name}`,
      invoices: Number(c.uses),
      quantity: Number(c.uses),
      discount: n(c.discount as number),
      revenue: n(c.revenue as number),
      customers: Number(c.customers),
    })),
    ...promos.map((p) => ({
      type: p.type as "flash_sale" | "buy_x_get_y" | "combo",
      id: p.promotion_id,
      name: names.get(`${p.type}:${p.promotion_id}`) ?? `#${p.promotion_id}`,
      invoices: Number(p.invoices),
      quantity: n(p.quantity as number),
      discount: n(p.discount as number),
      revenue: n(p.revenue as number),
      customers: null as number | null,
    })),
  ].map((r) => ({
    ...r,
    avgOrder: r.invoices ? Math.round(r.revenue / r.invoices) : 0,
    /** Discount as a share of the revenue it came with */
    discountRate:
      r.revenue > 0 ? Math.round((r.discount / (r.revenue + r.discount)) * 1000) / 10 : 0,
  }));
  return {
    from: input.from,
    to: input.to,
    rows,
    totals: {
      discount: rows.reduce((s, r) => s + r.discount, 0),
      invoices: rows.reduce((s, r) => s + r.invoices, 0),
    },
  };
}
