/**
 * POS cart arithmetic shared by the server (authoritative invoice totals) and the
 * browser (offline/BroadcastChannel mode). Pure functions, no I/O.
 *
 * Order: line discount → member (ranking) discount → coupon. Prices include VAT;
 * tax is reported as the VAT share of each line, it is never added on top.
 * All money is rounded to whole VND.
 */

export interface CartLine {
  /** Stable id of the line inside a cart (not a DB id) */
  id: string;
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxRate: number;
}

export interface CouponRule {
  code: string;
  name: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
}

export interface PricedLine extends CartLine {
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface CartTotals {
  lines: PricedLine[];
  itemCount: number;
  subtotal: number;
  lineDiscount: number;
  memberDiscountPercent: number;
  memberDiscount: number;
  coupon: { code: string; name: string; discount: number } | null;
  /** Coupon given but not applicable to this cart (e.g. below minimum order) */
  couponError: string | null;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

const round = (n: number) => Math.round(n);

export function couponDiscount(
  rule: CouponRule,
  amount: number,
): { discount: number; error: string | null } {
  if (rule.minOrderAmount !== null && amount < rule.minOrderAmount) {
    return {
      discount: 0,
      error: `Mã ${rule.code} áp dụng cho đơn từ ${rule.minOrderAmount.toLocaleString("vi-VN")}₫`,
    };
  }
  if (rule.type === "free_shipping")
    return { discount: 0, error: `Mã ${rule.code} chỉ áp dụng cho đơn giao hàng` };
  let discount = rule.type === "percent" ? (amount * rule.value) / 100 : rule.value;
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return { discount: round(Math.min(discount, amount)), error: null };
}

export function computeCart(
  lines: CartLine[],
  opts: { memberDiscountPercent?: number; coupon?: CouponRule | null } = {},
): CartTotals {
  const priced: PricedLine[] = lines.map((l) => {
    const gross = l.unitPrice * l.quantity;
    const discountAmount = round((gross * l.discountPercent) / 100);
    const totalAmount = round(gross - discountAmount);
    return { ...l, discountAmount, totalAmount, taxAmount: 0 };
  });

  const subtotal = priced.reduce((s, l) => s + round(l.unitPrice * l.quantity), 0);
  const lineDiscount = priced.reduce((s, l) => s + l.discountAmount, 0);
  const afterLines = subtotal - lineDiscount;

  const memberDiscountPercent = opts.memberDiscountPercent ?? 0;
  const memberDiscount = round((afterLines * memberDiscountPercent) / 100);
  const afterMember = afterLines - memberDiscount;

  let coupon: CartTotals["coupon"] = null;
  let couponError: string | null = null;
  if (opts.coupon) {
    const r = couponDiscount(opts.coupon, afterMember);
    couponError = r.error;
    if (!r.error) coupon = { code: opts.coupon.code, name: opts.coupon.name, discount: r.discount };
  }

  const total = afterMember - (coupon?.discount ?? 0);

  // VAT share: spread the order-level discounts over lines pro rata, then extract tax
  const ratio = afterLines > 0 ? total / afterLines : 0;
  for (const l of priced) {
    const net = l.totalAmount * ratio;
    l.taxAmount = l.taxRate > 0 ? round(net - net / (1 + l.taxRate / 100)) : 0;
  }

  return {
    lines: priced,
    itemCount: priced.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    lineDiscount,
    memberDiscountPercent,
    memberDiscount,
    coupon,
    couponError,
    discountAmount: lineDiscount + memberDiscount + (coupon?.discount ?? 0),
    taxAmount: priced.reduce((s, l) => s + l.taxAmount, 0),
    total,
  };
}

// ─── Membership ranking (SRS-CRM, "Xếp hạng thành viên mặc định") ─────────────

export type Ranking = "silver" | "gold" | "vip" | "diamond";

export const RANKINGS: {
  ranking: Ranking;
  minSpent: number;
  pointMultiplier: number;
  discountPercent: number;
}[] = [
  { ranking: "diamond", minSpent: 50_000_000, pointMultiplier: 2, discountPercent: 15 },
  { ranking: "vip", minSpent: 20_000_000, pointMultiplier: 1.5, discountPercent: 10 },
  { ranking: "gold", minSpent: 5_000_000, pointMultiplier: 1.2, discountPercent: 5 },
  { ranking: "silver", minSpent: 0, pointMultiplier: 1, discountPercent: 0 },
];

export function rankingRule(ranking: string) {
  return RANKINGS.find((r) => r.ranking === ranking) ?? RANKINGS[RANKINGS.length - 1];
}

/** "Chi tiêu > 5 triệu" → strictly greater than the threshold */
export function rankingForSpent(totalSpent: number): Ranking {
  return (RANKINGS.find((r) => r.minSpent === 0 || totalSpent > r.minSpent) ?? RANKINGS[3]).ranking;
}

/** Points earned: `loyaltyRate` points per 1.000₫ (store_config), times the ranking multiplier */
export function pointsFor(total: number, ranking: string, loyaltyRate: number): number {
  return Math.floor((total / 1000) * loyaltyRate * rankingRule(ranking).pointMultiplier);
}
