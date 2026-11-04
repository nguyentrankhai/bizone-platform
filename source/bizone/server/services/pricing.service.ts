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
import type { Prisma } from "@/generated/prisma/client";

type Db = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

/** Coupon condition that makes a coupon apply itself when no code is entered */
const AUTO_APPLY_CONDITION = "auto_apply";

export interface ResolvedCoupon extends CouponRule {
  id: number;
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
    };
  });
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

function toRule(c: {
  id: number;
  code: string;
  name: string;
  type: "percent" | "fixed" | "free_shipping";
  value: unknown;
  maxDiscount: unknown;
  minOrderAmount: unknown;
}): ResolvedCoupon {
  return {
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
} as const;

type CouponRow = Awaited<ReturnType<typeof loadCouponRow>>;

function loadCouponRow(code: string, db: Db) {
  return db.coupon.findUnique({ where: { code }, select: couponSelect });
}

/** Reason the coupon can't be used right now, or null if it can */
async function couponProblem(
  c: NonNullable<CouponRow>,
  customerId: number | null | undefined,
  db: Db,
): Promise<string | null> {
  const now = new Date();
  if (!c.isActive) return `Mã ${c.code} đã ngừng áp dụng`;
  if (c.startDate && c.startDate > now) return `Mã ${c.code} chưa đến thời gian áp dụng`;
  if (c.endDate && c.endDate < now) return `Mã ${c.code} đã hết hạn`;
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit)
    return `Mã ${c.code} đã hết lượt sử dụng`;
  if (
    c.applicableChannels &&
    !c.applicableChannels
      .split(",")
      .map((s) => s.trim())
      .includes("pos")
  ) {
    return `Mã ${c.code} không áp dụng tại quầy`;
  }
  if (c.usagePerCustomer !== null) {
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
  const row = await loadCouponRow(code.trim().toUpperCase(), db);
  if (!row) return { coupon: null, error: `Mã giảm giá "${code}" không tồn tại` };
  const problem = await couponProblem(row, customerId, db);
  return problem ? { coupon: null, error: problem } : { coupon: toRule(row), error: null };
}

/** Auto-apply: best currently valid coupon flagged with condition auto_apply=true */
export async function bestAutoCoupon(
  amount: number,
  customerId: number | null | undefined,
  db: Db = getPrisma(),
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
    const rule = toRule(row);
    const { discount, error } = couponDiscount(rule, amount);
    if (!error && discount > 0 && (!best || discount > best.discount)) best = { rule, discount };
  }
  return best?.rule ?? null;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

/**
 * Price a cart exactly as createInvoice will: DB prices, member discount by ranking,
 * then the entered coupon (or the best auto-apply coupon when none is entered).
 */
export async function quoteCart(
  input: QuoteInput & { items: (InvoiceItemInput & { id?: string })[] },
  db: Db = getPrisma(),
) {
  const [lines, customer] = await Promise.all([
    loadCartLines(input.items, db),
    loadCustomer(input.customerId, db),
  ]);
  const memberDiscountPercent = customer ? rankingRule(customer.ranking).discountPercent : 0;
  const base = computeCart(lines, { memberDiscountPercent });
  const afterMember = base.subtotal - base.lineDiscount - base.memberDiscount;

  let coupon: ResolvedCoupon | null = null;
  let couponError: string | null = null;
  if (input.couponCode) {
    ({ coupon, error: couponError } = await resolveCoupon(input.couponCode, input.customerId, db));
  } else if (lines.length > 0) {
    coupon = await bestAutoCoupon(afterMember, input.customerId, db);
  }

  const totals = computeCart(lines, { memberDiscountPercent, coupon });
  return {
    totals: { ...totals, couponError: couponError ?? totals.couponError },
    couponId: totals.coupon ? (coupon?.id ?? null) : null,
    customer,
  };
}
