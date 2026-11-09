import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import {
  computeCart,
  couponDiscount,
  rankingRule,
  type CartLine,
  type CouponRule,
} from "@/lib/pos/cart";
import type { InvoiceItemInput, QuoteInput } from "@/lib/validators/pos";
import {
  applyPromotions,
  EMPTY_PROMOS,
  type PromoContext,
  type PromotionUse,
} from "@/lib/pos/promotions";
import type { Prisma } from "@/generated/prisma/client";

type Db = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

/** Coupon condition that makes a coupon apply itself when no code is entered */
const AUTO_APPLY_CONDITION = "auto_apply";
/** Coupon condition: comma list of customer rankings allowed (silver,gold,vip,diamond) */
export const RANKINGS_CONDITION = "rankings";
/** Coupon condition: comma list of category ids (sub-categories included) the coupon covers */
export const CATEGORIES_CONDITION = "category_ids";

const RANKING_LABEL: Record<string, string> = {
  silver: "Bạc",
  gold: "Vàng",
  vip: "VIP",
  diamond: "Kim cương",
};

export interface ResolvedCoupon extends CouponRule {
  id: number;
  /** Personal voucher this code belongs to (coupon = the voucher's template) */
  voucherId: number | null;
  /** Categories (with descendants) the discount applies to; null = whole order */
  categoryIds: number[] | null;
}

// ─── Product lookup ───────────────────────────────────────────────────────────

/**
 * Barcode / SKU scan: product barcode or SKU, variant barcode or SKU, or an extra
 * barcode in product_barcodes. Exact match only — this is the scanner path.
 */
export async function findProductByCode(code: string, db: Db = getPrisma()) {
  const c = code.trim();
  if (!c) return null;
  const product = await db.product.findFirst({
    where: { OR: [{ barcode: c }, { sku: c }], status: "active" },
    select: { id: true },
  });
  if (product) return { productId: product.id, variantId: null };

  const variant = await db.productVariant.findFirst({
    where: { OR: [{ barcode: c }, { sku: c }], status: "active", product: { status: "active" } },
    select: { id: true, productId: true },
  });
  if (variant) return { productId: variant.productId, variantId: variant.id };

  const extra = await db.productBarcode.findFirst({
    where: { barcode: c, product: { status: "active" } },
    select: { productId: true, variantId: true },
  });
  return extra ? { productId: extra.productId, variantId: extra.variantId } : null;
}

/** Build priced cart lines from DB prices (the server never trusts client prices) */
export async function loadCartLines(
  items: (InvoiceItemInput & { id?: string })[],
  db: Db = getPrisma(),
): Promise<CartLine[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is number => !!v))];
  const [products, variants] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        sellingPrice: true,
        taxRate: true,
        status: true,
        categoryId: true,
      },
    }),
    variantIds.length
      ? db.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, productId: true, sku: true, sellingPrice: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  return items.map((item) => {
    const p = products.find((x) => x.id === item.productId);
    if (!p || p.status !== "active") {
      throw bizoneError("NOT_FOUND", `Sản phẩm #${item.productId} không tồn tại hoặc ngừng bán`);
    }
    const v = item.variantId ? variants.find((x) => x.id === item.variantId) : undefined;
    if (item.variantId && (!v || v.productId !== p.id || v.status !== "active")) {
      throw bizoneError("NOT_FOUND", `Biến thể #${item.variantId} của "${p.name}" không hợp lệ`);
    }
    return {
      id: item.id ?? randomUUID().slice(0, 8),
      productId: p.id,
      variantId: v?.id ?? null,
      name: p.name,
      sku: v?.sku ?? p.sku,
      unit: p.unit,
      unitPrice: Number(v?.sellingPrice ?? p.sellingPrice),
      quantity: item.quantity,
      discountPercent: item.discountPercent ?? 0,
      taxRate: Number(p.taxRate),
      categoryId: p.categoryId,
    };
  });
}

// ─── Automatic promotions (P4.4) ──────────────────────────────────────────────

/** Category id → itself + every descendant (5-level tree, small table) */
async function categoryDescendants(db: Db): Promise<(id: number) => number[]> {
  const all = await db.productCategory.findMany({ select: { id: true, parentId: true } });
  const children = new Map<number, number[]>();
  for (const c of all) {
    if (c.parentId === null) continue;
    children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  return (id: number) => {
    const out: number[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.includes(cur)) continue;
      out.push(cur);
      stack.push(...(children.get(cur) ?? []));
    }
    return out;
  };
}

/**
 * Promotions running at `now` that can touch these lines: flash sale offers of the cart's
 * products (limits left, per customer), active combos, buy-X-get-Y rules (+ gift products).
 */
export async function loadPromoContext(
  lines: CartLine[],
  customerId: number | null | undefined,
  db: Db = getPrisma(),
  now = new Date(),
): Promise<PromoContext> {
  if (lines.length === 0) return EMPTY_PROMOS;
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const [flashRows, combos, bxgy] = await Promise.all([
    db.flashSaleProduct.findMany({
      where: {
        productId: { in: productIds },
        flashSale: { status: { not: "cancelled" }, startTime: { lte: now }, endTime: { gt: now } },
      },
      include: { flashSale: { select: { id: true, name: true } } },
    }),
    db.promotionCombo.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gt: now } }] },
        ],
        promotionComboItems: { some: { productId: { in: productIds } } },
      },
      include: { promotionComboItems: { select: { productId: true, quantity: true } } },
    }),
    db.promotionBuyXGetY.findMany({
      where: { isActive: true, startDate: { lte: now }, endDate: { gt: now } },
      orderBy: { id: "asc" },
    }),
  ]);

  // Per-customer flash limits: units this customer already bought in each offer
  const boughtByItem = new Map<number, number>();
  const limited = flashRows.filter((f) => f.perCustomerLimit > 0).map((f) => f.id);
  if (customerId && limited.length) {
    const rows = await db.promotionUsage.groupBy({
      by: ["itemRefId"],
      where: { promotionType: "flash_sale", itemRefId: { in: limited }, customerId },
      _sum: { quantity: true },
    });
    for (const r of rows) if (r.itemRefId) boughtByItem.set(r.itemRefId, r._sum.quantity ?? 0);
  }

  const needsTree = bxgy.some((r) => r.buyCategoryId || r.getCategoryId);
  const tree = needsTree ? await categoryDescendants(db) : null;
  const giftIds = [...new Set(bxgy.map((r) => r.getProductId).filter((x): x is number => !!x))];
  const gifts = giftIds.length
    ? await db.product.findMany({
        where: { id: { in: giftIds }, status: "active" },
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          sellingPrice: true,
          taxRate: true,
          categoryId: true,
        },
      })
    : [];

  return {
    flash: flashRows.map((f) => ({
      flashSaleId: f.flashSale.id,
      itemId: f.id,
      name: f.flashSale.name,
      productId: f.productId,
      variantId: f.variantId,
      flashPrice: Number(f.flashPrice),
      remaining: f.quantityLimit > 0 ? Math.max(0, f.quantityLimit - f.soldQuantity) : null,
      // Without a known customer the per-customer limit caps the units of this invoice
      perCustomerRemaining:
        f.perCustomerLimit > 0
          ? Math.max(0, f.perCustomerLimit - (boughtByItem.get(f.id) ?? 0))
          : null,
    })),
    combos: combos.map((c) => ({
      id: c.id,
      name: c.name,
      comboPrice: Number(c.comboPrice),
      items: c.promotionComboItems,
      remaining: c.quantityLimit > 0 ? Math.max(0, c.quantityLimit - c.soldCount) : null,
    })),
    buyXGetY: bxgy.map((r) => ({
      id: r.id,
      name: r.name,
      buyProductId: r.buyProductId,
      buyCategoryIds: r.buyCategoryId && tree ? tree(r.buyCategoryId) : null,
      buyQuantity: r.buyQuantity,
      getProductId: r.getProductId,
      getCategoryIds: r.getCategoryId && tree ? tree(r.getCategoryId) : null,
      getQuantity: r.getQuantity,
      getDiscountPercent: Number(r.getDiscountPercent),
    })),
    giftProducts: Object.fromEntries(
      gifts.map((g) => [
        g.id,
        {
          productId: g.id,
          name: g.name,
          sku: g.sku,
          unit: g.unit,
          unitPrice: Number(g.sellingPrice),
          taxRate: Number(g.taxRate),
          categoryId: g.categoryId,
        },
      ]),
    ),
  };
}

// ─── Customer & coupon ────────────────────────────────────────────────────────

export async function loadCustomer(customerId: number | null | undefined, db: Db = getPrisma()) {
  if (!customerId) return null;
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      ranking: true,
      totalPoints: true,
      isActive: true,
    },
  });
  if (!c || !c.isActive) throw bizoneError("NOT_FOUND", `Khách hàng #${customerId} không tồn tại`);
  return c;
}

function toRule(
  c: {
    id: number;
    code: string;
    name: string;
    type: "percent" | "fixed" | "free_shipping";
    value: unknown;
    maxDiscount: unknown;
    minOrderAmount: unknown;
  },
  extra: Partial<Pick<ResolvedCoupon, "voucherId" | "categoryIds">> = {},
): ResolvedCoupon {
  return {
    voucherId: extra.voucherId ?? null,
    categoryIds: extra.categoryIds ?? null,
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    value: Number(c.value),
    maxDiscount: c.maxDiscount === null ? null : Number(c.maxDiscount),
    minOrderAmount: c.minOrderAmount === null ? null : Number(c.minOrderAmount),
  };
}

const couponSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  value: true,
  maxDiscount: true,
  minOrderAmount: true,
  isActive: true,
  startDate: true,
  endDate: true,
  usageLimit: true,
  usedCount: true,
  usagePerCustomer: true,
  applicableChannels: true,
  couponConditions: { select: { conditionType: true, conditionValue: true } },
} as const;

type CouponRow = Awaited<ReturnType<typeof loadCouponRow>>;

function loadCouponRow(code: string, db: Db) {
  return db.coupon.findUnique({ where: { code }, select: couponSelect });
}

/** Reason the coupon can't be used right now, or null if it can */
function conditionValue(c: NonNullable<CouponRow>, type: string): string | null {
  return c.couponConditions.find((x) => x.conditionType === type)?.conditionValue ?? null;
}

function listOf(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function couponProblem(
  c: NonNullable<CouponRow>,
  customerId: number | null | undefined,
  db: Db,
  opts: { voucher?: boolean } = {},
): Promise<string | null> {
  const now = new Date();
  if (!c.isActive) return `Mã ${c.code} đã ngừng áp dụng`;
  if (!opts.voucher) {
    // A voucher has its own expiry and is single-use — the template's window / limit don't apply
    if (c.startDate && c.startDate > now) return `Mã ${c.code} chưa đến thời gian áp dụng`;
    if (c.endDate && c.endDate < now) return `Mã ${c.code} đã hết hạn`;
    if (c.usageLimit !== null && c.usedCount >= c.usageLimit)
      return `Mã ${c.code} đã hết lượt sử dụng`;
  }
  const rankings = listOf(conditionValue(c, RANKINGS_CONDITION));
  if (rankings.length) {
    const customer = customerId
      ? await db.customer.findUnique({ where: { id: customerId }, select: { ranking: true } })
      : null;
    if (!customer) return `Mã ${c.code} chỉ dành cho khách hàng thành viên`;
    if (!rankings.includes(customer.ranking))
      return `Mã ${c.code} chỉ dành cho hạng ${rankings.map((r) => RANKING_LABEL[r] ?? r).join(", ")}`;
  }
  if (
    c.applicableChannels &&
    !c.applicableChannels
      .split(",")
      .map((s) => s.trim())
      .includes("pos")
  ) {
    return `Mã ${c.code} không áp dụng tại quầy`;
  }
  if (c.usagePerCustomer !== null && !opts.voucher) {
    if (!customerId) return `Mã ${c.code} chỉ dành cho khách hàng thành viên`;
    const used = await db.couponUsage.count({ where: { couponId: c.id, customerId } });
    if (used >= c.usagePerCustomer) return `Khách hàng đã dùng hết lượt của mã ${c.code}`;
  }
  return null;
}

/** Explicit code entered by the cashier — any problem is reported to the caller */
export async function resolveCoupon(
  code: string,
  customerId: number | null | undefined,
  db: Db = getPrisma(),
): Promise<{ coupon: ResolvedCoupon | null; error: string | null }> {
  const normalized = code.trim().toUpperCase();
  const row = await loadCouponRow(normalized, db);
  if (row) {
    const problem = await couponProblem(row, customerId, db);
    if (problem) return { coupon: null, error: problem };
    return { coupon: toRule(row, { categoryIds: await couponCategories(row, db) }), error: null };
  }

  // Personal voucher: its own code, single use, optionally bound to one customer
  const voucher = await db.voucher.findUnique({
    where: { code: normalized },
    include: { coupon: { select: couponSelect } },
  });
  if (!voucher || !voucher.coupon)
    return { coupon: null, error: `Mã giảm giá "${code}" không tồn tại` };
  if (voucher.status === "used")
    return { coupon: null, error: `Voucher ${voucher.code} đã được sử dụng` };
  if (voucher.status !== "active" || (voucher.expiredAt && voucher.expiredAt < new Date()))
    return { coupon: null, error: `Voucher ${voucher.code} đã hết hạn` };
  if (voucher.customerId && voucher.customerId !== customerId) {
    return {
      coupon: null,
      error: customerId
        ? `Voucher ${voucher.code} dành cho khách hàng khác`
        : `Voucher ${voucher.code} dành cho khách hàng thành viên — chọn khách hàng trước`,
    };
  }
  const problem = await couponProblem(voucher.coupon, customerId, db, { voucher: true });
  if (problem) return { coupon: null, error: problem.replace(voucher.coupon.code, voucher.code) };
  return {
    coupon: {
      ...toRule(voucher.coupon, {
        voucherId: voucher.id,
        categoryIds: await couponCategories(voucher.coupon, db),
      }),
      code: voucher.code,
    },
    error: null,
  };
}

async function couponCategories(c: NonNullable<CouponRow>, db: Db): Promise<number[] | null> {
  const ids = listOf(conditionValue(c, CATEGORIES_CONDITION))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return null;
  const tree = await categoryDescendants(db);
  return [...new Set(ids.flatMap((id) => tree(id)))];
}

/** Auto-apply: best currently valid coupon flagged with condition auto_apply=true */
export async function bestAutoCoupon(
  amount: number,
  customerId: number | null | undefined,
  db: Db = getPrisma(),
  /** Discount this rule would give the cart (category-limited coupons price only their lines) */
  discountOf?: (rule: ResolvedCoupon) => number,
): Promise<ResolvedCoupon | null> {
  const rows = await db.coupon.findMany({
    where: {
      isActive: true,
      couponConditions: { some: { conditionType: AUTO_APPLY_CONDITION, conditionValue: "true" } },
    },
    select: couponSelect,
  });
  let best: { rule: ResolvedCoupon; discount: number } | null = null;
  for (const row of rows) {
    if (await couponProblem(row, customerId, db)) continue;
    const rule = toRule(row, { categoryIds: await couponCategories(row, db) });
    const discount = discountOf
      ? discountOf(rule)
      : (({ discount, error }) => (error ? 0 : discount))(couponDiscount(rule, amount));
    if (discount > 0 && (!best || discount > best.discount)) best = { rule, discount };
  }
  return best?.rule ?? null;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

function eligibleFor(coupon: ResolvedCoupon | null) {
  const ids = coupon?.categoryIds;
  return ids ? (l: CartLine) => l.categoryId != null && ids.includes(l.categoryId) : undefined;
}

/**
 * Price a cart exactly as createInvoice will: DB prices, automatic promotions (flash sale,
 * combo, buy X get Y — gift lines added here), member discount by ranking, then the entered
 * coupon / voucher (or the best auto-apply coupon when none is entered).
 */
export async function quoteCart(
  input: QuoteInput & { items: (InvoiceItemInput & { id?: string })[] },
  db: Db = getPrisma(),
) {
  const [rawLines, customer] = await Promise.all([
    loadCartLines(input.items, db),
    loadCustomer(input.customerId, db),
  ]);
  const promoCtx = await loadPromoContext(rawLines, input.customerId, db);
  const { lines, uses } = applyPromotions(rawLines, promoCtx);
  const memberDiscountPercent = customer ? rankingRule(customer.ranking).discountPercent : 0;
  const base = computeCart(lines, { memberDiscountPercent });
  const afterMember = base.subtotal - base.lineDiscount - base.memberDiscount;

  let coupon: ResolvedCoupon | null = null;
  let couponError: string | null = null;
  if (input.couponCode) {
    ({ coupon, error: couponError } = await resolveCoupon(input.couponCode, input.customerId, db));
  } else if (lines.length > 0) {
    coupon = await bestAutoCoupon(
      afterMember,
      input.customerId,
      db,
      (rule) =>
        computeCart(lines, {
          memberDiscountPercent,
          coupon: rule,
          couponEligible: eligibleFor(rule),
        }).coupon?.discount ?? 0,
    );
  }

  const totals = computeCart(lines, {
    memberDiscountPercent,
    coupon,
    couponEligible: eligibleFor(coupon),
  });
  return {
    totals: { ...totals, couponError: couponError ?? totals.couponError },
    couponId: totals.coupon ? (coupon?.id ?? null) : null,
    voucherId: totals.coupon ? (coupon?.voucherId ?? null) : null,
    promotionUses: uses as PromotionUse[],
    customer,
  };
}
