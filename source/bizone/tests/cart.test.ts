import { describe, expect, it } from "vitest";
import {
  computeCart,
  couponDiscount,
  pointsFor,
  rankingForSpent,
  type CartLine,
  type CouponRule,
} from "@/lib/pos/cart";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: "a",
  productId: 1,
  variantId: null,
  name: "SP",
  sku: "SP1",
  unit: "cái",
  unitPrice: 100_000,
  quantity: 2,
  discountPercent: 0,
  taxRate: 0,
  ...over,
});

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: "SALE10",
  name: "Giảm 10%",
  type: "percent",
  value: 10,
  maxDiscount: null,
  minOrderAmount: null,
  ...over,
});

describe("computeCart", () => {
  it("applies line → member → coupon discounts in order", () => {
    const t = computeCart([line({ discountPercent: 10 })], {
      memberDiscountPercent: 5,
      coupon: coupon(),
    });
    expect(t.subtotal).toBe(200_000);
    expect(t.lineDiscount).toBe(20_000); // 10% of 200k
    expect(t.memberDiscount).toBe(9_000); // 5% of 180k
    expect(t.coupon?.discount).toBe(17_100); // 10% of 171k
    expect(t.total).toBe(153_900);
    expect(t.discountAmount).toBe(t.subtotal - t.total);
  });

  it("extracts VAT from prices that already include it", () => {
    const t = computeCart([line({ unitPrice: 110_000, quantity: 1, taxRate: 10 })]);
    expect(t.total).toBe(110_000);
    expect(t.taxAmount).toBe(10_000);
  });

  it("reports a coupon below the minimum order instead of applying it", () => {
    const t = computeCart([line()], { coupon: coupon({ minOrderAmount: 500_000 }) });
    expect(t.coupon).toBeNull();
    expect(t.couponError).toMatch(/SALE10/);
    expect(t.total).toBe(200_000);
  });

  it("handles an empty cart", () => {
    const t = computeCart([]);
    expect(t).toMatchObject({ subtotal: 0, total: 0, itemCount: 0, taxAmount: 0 });
  });
});

describe("couponDiscount", () => {
  it("caps percent coupons at maxDiscount", () => {
    expect(couponDiscount(coupon({ value: 50, maxDiscount: 30_000 }), 200_000).discount).toBe(
      30_000,
    );
  });
  it("never discounts more than the amount", () => {
    expect(couponDiscount(coupon({ type: "fixed", value: 500_000 }), 200_000).discount).toBe(
      200_000,
    );
  });
  it("rejects free-shipping coupons at the POS", () => {
    expect(couponDiscount(coupon({ type: "free_shipping" }), 200_000).error).toBeTruthy();
  });
});

describe("ranking & points", () => {
  it("uses strictly-greater thresholds", () => {
    expect(rankingForSpent(5_000_000)).toBe("silver");
    expect(rankingForSpent(5_000_001)).toBe("gold");
    expect(rankingForSpent(20_000_001)).toBe("vip");
    expect(rankingForSpent(50_000_001)).toBe("diamond");
  });
  it("multiplies points by the ranking", () => {
    expect(pointsFor(100_000, "silver", 1)).toBe(100);
    expect(pointsFor(100_000, "diamond", 1)).toBe(200);
  });
});
