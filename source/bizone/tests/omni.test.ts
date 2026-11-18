import { describe, expect, it } from "vitest";
import {
  isStorefrontUrl,
  normalizePhone,
  orderGoodsRevenue,
  parseWebTxnId,
  parseWebsiteConfig,
  productIdFromSlug,
  productSlug,
  shippingFeeFor,
  webTxnIdOf,
  websiteConfigSchema,
} from "@/lib/omni/website";
import { hashPassword, newStoreKey, parseStoreKey, verifyPassword } from "@/lib/omni/secrets";
import { parseMerchantTxnId } from "@/server/services/payhubPayment.service";

describe("store key", () => {
  it("names its tenant and is long and random", () => {
    const k = newStoreKey("tenant_demo");
    expect(parseStoreKey(k)).toEqual({ tenantId: "tenant_demo" });
    expect(k).not.toBe(newStoreKey("tenant_demo"));
    expect(k.length).toBeGreaterThan(50);
  });
  it("rejects malformed keys", () => {
    expect(parseStoreKey("bzs.tenant_demo.short")).toBeNull();
    expect(parseStoreKey("bzs.bad tenant." + "a".repeat(43))).toBeNull();
    expect(parseStoreKey(null)).toBeNull();
    expect(parseStoreKey("pk_live_" + "a".repeat(43))).toBeNull();
  });
});

describe("website config", () => {
  it("applies defaults and validates the sub-domain", () => {
    const c = websiteConfigSchema.parse({ storeName: "Shop", slug: "Demo-Shop", branchId: 1 });
    expect(c).toMatchObject({
      slug: "demo-shop",
      shippingFee: 30000,
      freeShippingFrom: null,
      paymentMethods: ["cod", "payhub"],
      paymentMinutes: 30,
    });
    expect(websiteConfigSchema.safeParse({ storeName: "S", slug: "-x", branchId: 1 }).success).toBe(
      false,
    );
    expect(websiteConfigSchema.safeParse({ storeName: "S", slug: "a", branchId: 1 }).success).toBe(
      false,
    );
    expect(
      websiteConfigSchema.safeParse({ storeName: "S", slug: "ab", branchId: 1, paymentMethods: [] })
        .success,
    ).toBe(false);
    expect(parseWebsiteConfig("{broken")).toBeNull();
    expect(parseWebsiteConfig(JSON.stringify(c))).toEqual(c);
  });
  it("free shipping from a goods total", () => {
    expect(shippingFeeFor({ shippingFee: 30000, freeShippingFrom: 500000 }, 499999)).toBe(30000);
    expect(shippingFeeFor({ shippingFee: 30000, freeShippingFrom: 500000 }, 500000)).toBe(0);
    expect(shippingFeeFor({ shippingFee: 30000, freeShippingFrom: null }, 9e9)).toBe(30000);
  });
  it("return URL must stay on the storefront", () => {
    expect(isStorefrontUrl("http://localhost:3100/checkout/result", "http://localhost:3100")).toBe(
      true,
    );
    expect(isStorefrontUrl("https://evil.com/checkout/result", "http://localhost:3100")).toBe(
      false,
    );
    expect(isStorefrontUrl("http://localhost:3100.evil.com/x", "http://localhost:3100")).toBe(
      false,
    );
    expect(isStorefrontUrl("javascript:alert(1)", "http://localhost:3100")).toBe(false);
  });
});

describe("customer accounts", () => {
  it("normalizes Vietnamese mobile numbers", () => {
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("84912345678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("09123456789")).toBeNull();
  });
  it("hashes passwords with a salt", async () => {
    const h = await hashPassword("matkhau123");
    expect(h).toMatch(/^scrypt\$/);
    expect(h).not.toBe(await hashPassword("matkhau123"));
    expect(await verifyPassword("matkhau123", h)).toBe(true);
    expect(await verifyPassword("matkhau124", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("orders & payments", () => {
  it("website payment ids carry the tenant and never look like POS ones", () => {
    const id = webTxnIdOf("tenant_demo", 42);
    expect(id).toBe("WEB-tenant_demo-42");
    expect(parseWebTxnId(id)).toEqual({ tenantId: "tenant_demo", paymentId: 42 });
    expect(parseMerchantTxnId(id)).toBeNull();
    expect(parseWebTxnId("BZ-tenant_demo-42")).toBeNull();
    // placeholder written before the real id is known (never sent to Payment Hub)
    expect(parseWebTxnId("WEB-tenant_demo-new-1763450000000-k3x9qa")).toBeNull();
  });
  it("product slugs", () => {
    expect(productSlug(12, "Áo thun Đen size M")).toBe("12-ao-thun-den-size-m");
    expect(productSlug(5, "!!!")).toBe("5");
    expect(productIdFromSlug("12-ao-thun")).toBe(12);
    expect(productIdFromSlug("12")).toBe(12);
    expect(productIdFromSlug("ao-12")).toBeNull();
    expect(productIdFromSlug("0-x")).toBeNull();
  });
  it("revenue of a completed order is the goods total without the delivery fee", () => {
    expect(orderGoodsRevenue({ totalAmount: 230000, shippingFee: 30000 })).toBe(200000);
    // free-shipping coupon: fee 30k charged, 30k discounted → goods revenue reduced by the shop's cost
    expect(orderGoodsRevenue({ totalAmount: 200000, shippingFee: 30000 })).toBe(170000);
    expect(orderGoodsRevenue({ totalAmount: 10000, shippingFee: 30000 })).toBe(0);
  });
});
