import { describe, expect, it } from "vitest";
import { computeCart, type CartLine } from "@/lib/pos/cart";
import { applyPromotions, EMPTY_PROMOS, type PromoContext } from "@/lib/pos/promotions";
import {
  buyXGetYSchema,
  comboSchema,
  createCouponSchema,
  createFlashSaleSchema,
} from "@/lib/validators/marketing";

const line = (
  id: string,
  productId: number,
  unitPrice: number,
  quantity: number,
  extra: Partial<CartLine> = {},
): CartLine => ({
  id,
  productId,
  variantId: null,
  name: `P${productId}`,
  sku: `SKU${productId}`,
  unit: "cái",
  unitPrice,
  quantity,
  discountPercent: 0,
  taxRate: 0,
  categoryId: null,
  ...extra,
});
const ctx = (p: Partial<PromoContext>): PromoContext => ({ ...EMPTY_PROMOS, ...p });
const flash = (over: Partial<PromoContext["flash"][number]> = {}) => ({
  flashSaleId: 1,
  itemId: 11,
  name: "Trưa",
  productId: 1,
  variantId: null,
  flashPrice: 9000,
  remaining: null,
  perCustomerRemaining: null,
  ...over,
});

describe("flash sale", () => {
  it("prices units at the flash price within the remaining quantity", () => {
    const { lines, uses } = applyPromotions(
      [line("a", 1, 15000, 4)],
      ctx({ flash: [flash({ remaining: 3 })] }),
    );
    const t = computeCart(lines);
    expect(t.total).toBe(3 * 9000 + 15000);
    expect(t.promotionDiscount).toBe(18000);
    expect(uses).toEqual([
      expect.objectContaining({ type: "flash_sale", itemRefId: 11, quantity: 3, discount: 18000 }),
    ]);
  });
  it("shares the limit across lines and respects the per-customer cap", () => {
    const { uses } = applyPromotions(
      [line("a", 1, 15000, 2, { variantId: 5 }), line("b", 1, 15000, 2, { variantId: 6 })],
      ctx({ flash: [flash({ remaining: 10, perCustomerRemaining: 3 })] }),
    );
    expect(uses.reduce((s, u) => s + u.quantity, 0)).toBe(3);
  });
  it("ignores offers not cheaper than the price or for another variant", () => {
    const { lines } = applyPromotions(
      [line("a", 1, 8000, 1), line("b", 2, 20000, 1, { variantId: 7 })],
      ctx({ flash: [flash(), flash({ itemId: 12, productId: 2, variantId: 8, flashPrice: 1 })] }),
    );
    expect(computeCart(lines).promotionDiscount).toBe(0);
  });
  it("cashier line discount applies after the flash price", () => {
    const { lines } = applyPromotions(
      [line("a", 1, 15000, 1, { discountPercent: 10 })],
      ctx({ flash: [flash()] }),
    );
    expect(computeCart(lines).total).toBe(8100);
  });
});

describe("combo", () => {
  const combo = {
    id: 3,
    name: "Sáng",
    comboPrice: 60000,
    items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ],
    remaining: null,
  };
  it("discounts complete sets and splits the saving over the lines", () => {
    const { lines, uses } = applyPromotions(
      [line("a", 1, 15000, 2), line("b", 2, 50000, 1)],
      ctx({ combos: [combo] }),
    );
    const t = computeCart(lines);
    expect(t.promotionDiscount).toBe(5000);
    expect(t.total).toBe(75000);
    expect(lines.reduce((s, l) => s + (l.promoDiscount ?? 0), 0)).toBe(5000);
    expect(uses[0]).toMatchObject({ type: "combo", quantity: 1 });
  });
  it("stops at the sets left and skips units already on flash sale", () => {
    expect(
      applyPromotions(
        [line("a", 1, 15000, 3), line("b", 2, 50000, 3)],
        ctx({ combos: [{ ...combo, remaining: 2 }] }),
      ).uses[0].quantity,
    ).toBe(2);
    const r = applyPromotions(
      [line("a", 1, 15000, 1), line("b", 2, 50000, 1)],
      ctx({ combos: [combo], flash: [flash()] }),
    );
    expect(r.uses.map((u) => u.type)).toEqual(["flash_sale"]);
  });
});

describe("buy X get Y", () => {
  const gift = {
    productId: 9,
    name: "Kẹo",
    sku: "K",
    unit: "gói",
    unitPrice: 10000,
    taxRate: 0,
    categoryId: null,
  };
  const rule = {
    id: 4,
    name: "Mua 2 tặng 1",
    buyProductId: 1,
    buyCategoryIds: null,
    buyQuantity: 2,
    getProductId: 9,
    getCategoryIds: null,
    getQuantity: 1,
    getDiscountPercent: 100,
  };
  it("adds a free gift line per buyQuantity", () => {
    const { lines, uses } = applyPromotions(
      [line("a", 1, 20000, 5)],
      ctx({ buyXGetY: [rule], giftProducts: { 9: gift } }),
    );
    const g = lines.find((l) => l.isGift)!;
    expect(g).toMatchObject({ productId: 9, quantity: 2, id: "gift-4" });
    const t = computeCart(lines);
    expect(t.lines.find((l) => l.isGift)?.totalAmount).toBe(0);
    expect(t.total).toBe(100000);
    expect(uses[0]).toMatchObject({ quantity: 2, discount: 20000 });
  });
  it("no gift below the threshold; gift lines from the client are dropped and recomputed", () => {
    expect(
      applyPromotions(
        [line("a", 1, 20000, 1)],
        ctx({ buyXGetY: [rule], giftProducts: { 9: gift } }),
      ).lines,
    ).toHaveLength(1);
    const stale = line("gift-4", 9, 10000, 9, { isGift: true });
    expect(
      applyPromotions(
        [line("a", 1, 20000, 1), stale],
        ctx({ buyXGetY: [rule], giftProducts: { 9: gift } }),
      ).lines,
    ).toHaveLength(1);
  });
  it("same category for buy and get needs buy + get units (buy 2 get 1 at 50%)", () => {
    const r = {
      ...rule,
      buyProductId: null,
      buyCategoryIds: [7],
      getProductId: null,
      getCategoryIds: [7],
      getDiscountPercent: 50,
    };
    const at = (q: number) =>
      computeCart(
        applyPromotions([line("d", 3, 12000, q, { categoryId: 7 })], ctx({ buyXGetY: [r] })).lines,
      ).promotionDiscount;
    expect(at(2)).toBe(0);
    expect(at(3)).toBe(6000);
    expect(at(6)).toBe(12000);
  });
});

describe("coupon base on eligible categories", () => {
  it("prices a category coupon on its lines only, after member discount", () => {
    const lines = [
      line("a", 1, 20000, 1, { categoryId: 1 }),
      line("b", 2, 10000, 1, { categoryId: 2 }),
    ];
    const coupon = {
      code: "X",
      name: "x",
      type: "percent" as const,
      value: 20,
      maxDiscount: null,
      minOrderAmount: null,
    };
    const t = computeCart(lines, {
      memberDiscountPercent: 10,
      coupon,
      couponEligible: (l) => l.categoryId === 2,
    });
    expect(t.coupon?.discount).toBe(1800); // 10.000 × 90% × 20%
  });
});

describe("marketing validators", () => {
  it("reads datetime-local as Vietnam time", () => {
    const f = createFlashSaleSchema.parse({
      name: "x",
      startTime: "2026-11-10T12:00",
      endTime: "2026-11-10T13:00",
      items: [{ productId: 1, flashPrice: 1 }],
    });
    expect(f.startTime.toISOString()).toBe("2026-11-10T05:00:00.000Z");
    expect(
      createFlashSaleSchema.safeParse({
        name: "x",
        startTime: "2026-11-10T13:00",
        endTime: "2026-11-10T12:00",
        items: [{ productId: 1, flashPrice: 1 }],
      }).success,
    ).toBe(false);
  });
  it("checks coupon values and normalises the code", () => {
    expect(
      createCouponSchema.parse({ code: "giam10", name: "x", type: "percent", value: 10 }).code,
    ).toBe("GIAM10");
    expect(
      createCouponSchema.safeParse({ code: "GIAM", name: "x", type: "percent", value: 120 })
        .success,
    ).toBe(false);
    expect(
      createCouponSchema.safeParse({ code: "GIẢM", name: "x", type: "fixed", value: 1 }).success,
    ).toBe(false);
  });
  it("buy X get Y needs exactly one product or category on each side; combos ≥ 2 units", () => {
    const base = {
      name: "x",
      buyQuantity: 2,
      getQuantity: 1,
      startDate: "2026-11-10T00:00",
      endDate: "2026-12-10T00:00",
    };
    expect(buyXGetYSchema.safeParse({ ...base, buyProductId: 1, getProductId: 2 }).success).toBe(
      true,
    );
    expect(
      buyXGetYSchema.safeParse({ ...base, buyProductId: 1, buyCategoryId: 3, getProductId: 2 })
        .success,
    ).toBe(false);
    expect(buyXGetYSchema.safeParse({ ...base, buyProductId: 1 }).success).toBe(false);
    expect(
      comboSchema.safeParse({ name: "c", comboPrice: 1, items: [{ productId: 1, quantity: 1 }] })
        .success,
    ).toBe(false);
    expect(
      comboSchema.safeParse({ name: "c", comboPrice: 1, items: [{ productId: 1, quantity: 2 }] })
        .success,
    ).toBe(true);
  });
});
