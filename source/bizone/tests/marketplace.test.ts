import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  channelPrice,
  channelStock,
  mapLazadaStatus,
  mapShopeeStatus,
  marketplaceConfigSchema,
  plannedTransition,
  resolveCategory,
} from "@/lib/omni/marketplace";
import { decryptToken, encryptToken, tokenKeyConfigured } from "@/lib/omni/crypto";
import {
  shopeePublicSign,
  shopeePushSign,
  shopeeShopSign,
  shopeeVerifyPush,
} from "@/server/services/omni/shopee/signing";
import {
  lazadaDate,
  lazadaIso,
  lazadaSign,
  lazadaVerifyPush,
  xml,
} from "@/server/services/omni/lazada/signing";
import { shopeeConnector } from "@/server/services/omni/shopee";
import { lazadaConnector } from "@/server/services/omni/lazada";
import { MarketplaceError } from "@/server/services/omni/marketplace/types";

const hmacHex = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");

describe("P6.2 marketplace price / stock / category rules", () => {
  it("prices: no markup keeps the price, markup rounds up to 100₫", () => {
    expect(channelPrice(45_000, 0)).toBe(45_000);
    expect(channelPrice(45_000, 10)).toBe(49_500);
    expect(channelPrice(33_333, 7)).toBe(35_700); // 35 666.31 → 35 700
    expect(channelPrice(-5, 0)).toBe(0);
  });

  it("stock: on hand minus buffer, never negative, 0 when not sellable", () => {
    expect(channelStock(10, 0)).toBe(10);
    expect(channelStock(10, 3)).toBe(7);
    expect(channelStock(2, 5)).toBe(0);
    expect(channelStock(10.9, 0)).toBe(10);
    expect(channelStock(10, 0, false)).toBe(0);
  });

  it("category: own map, else nearest mapped ancestor, cycles stop", () => {
    const parents = new Map<number, number | null>([
      [1, null],
      [38, 4],
      [4, null],
      [99, 98],
      [98, 99],
    ]);
    expect(resolveCategory(38, parents, { "38": "100017" })).toBe("100017");
    expect(resolveCategory(38, parents, { "4": "100010" })).toBe("100010");
    expect(resolveCategory(1, parents, { "4": "100010" })).toBeNull();
    expect(resolveCategory(null, parents, { "4": "x" })).toBeNull();
    expect(resolveCategory(99, parents, {})).toBeNull();
  });

  it("config: defaults + validation", () => {
    const cfg = marketplaceConfigSchema.parse({ branchId: 1 });
    expect(cfg).toMatchObject({
      priceMarkupPercent: 0,
      stockBuffer: 0,
      autoSyncStock: true,
      categoryMap: {},
    });
    expect(marketplaceConfigSchema.safeParse({ branchId: 0 }).success).toBe(false);
    expect(
      marketplaceConfigSchema.safeParse({ branchId: 1, categoryMap: { abc: "1" } }).success,
    ).toBe(false);
  });
});

describe("P6.2 order status mapping", () => {
  it("Shopee statuses", () => {
    expect(mapShopeeStatus("UNPAID")).toBe("pending");
    expect(mapShopeeStatus("READY_TO_SHIP")).toBe("confirmed");
    expect(mapShopeeStatus("PROCESSED")).toBe("preparing");
    expect(mapShopeeStatus("SHIPPED")).toBe("shipping");
    expect(mapShopeeStatus("TO_CONFIRM_RECEIVE")).toBe("delivered");
    expect(mapShopeeStatus("COMPLETED")).toBe("completed");
    expect(mapShopeeStatus("CANCELLED")).toBe("cancelled");
    expect(mapShopeeStatus("TO_RETURN")).toBe("returned");
    expect(mapShopeeStatus("IN_CANCEL")).toBeNull();
  });

  it("Lazada item statuses: all cancelled, least advanced live item, all returned", () => {
    expect(mapLazadaStatus(["unpaid"])).toBe("pending");
    expect(mapLazadaStatus(["pending", "pending"])).toBe("confirmed");
    expect(mapLazadaStatus(["ready_to_ship"])).toBe("preparing");
    expect(mapLazadaStatus(["shipped", "delivered"])).toBe("shipping");
    expect(mapLazadaStatus(["delivered", "canceled"])).toBe("completed");
    expect(mapLazadaStatus(["canceled", "canceled"])).toBe("cancelled");
    expect(mapLazadaStatus(["returned", "failed_delivery"])).toBe("returned");
    expect(mapLazadaStatus([])).toBeNull();
    expect(mapLazadaStatus(["something_new"])).toBeNull();
  });

  it("transitions only move forward and close the BizOne way", () => {
    expect(plannedTransition("pending", "confirmed")).toBe("advance");
    expect(plannedTransition("pending", "shipping")).toBe("advance");
    expect(plannedTransition("shipping", "confirmed")).toBe("none");
    expect(plannedTransition("pending", null)).toBe("none");
    expect(plannedTransition("preparing", "cancelled")).toBe("cancel");
    expect(plannedTransition("shipping", "cancelled")).toBe("return");
    expect(plannedTransition("delivered", "returned")).toBe("return");
    expect(plannedTransition("confirmed", "completed")).toBe("complete");
    expect(plannedTransition("completed", "returned")).toBe("manual");
    expect(plannedTransition("cancelled", "completed")).toBe("none");
    expect(plannedTransition("completed", "completed")).toBe("none");
  });
});

describe("P6.2 Shopee signatures + push", () => {
  const key = "shpk-test-key-123456";
  it("public / shop / push signatures follow the v2 base strings", () => {
    expect(shopeePublicSign("2001", key, "/api/v2/shop/auth_partner", 1700000000)).toBe(
      hmacHex(key, "2001/api/v2/shop/auth_partner1700000000"),
    );
    expect(
      shopeeShopSign("2001", key, "/api/v2/order/get_order_list", 1700000000, "tok", "777"),
    ).toBe(hmacHex(key, "2001/api/v2/order/get_order_list1700000000tok777"));
    const body = '{"code":3,"shop_id":777}';
    const sig = shopeePushSign(key, "https://x.test/api/webhooks/shopee", body);
    expect(sig).toBe(hmacHex(key, `https://x.test/api/webhooks/shopee|${body}`));
    expect(shopeeVerifyPush(key, "https://x.test/api/webhooks/shopee", body, sig)).toBe(true);
    expect(shopeeVerifyPush(key, "https://x.test/api/webhooks/shopee", body + " ", sig)).toBe(
      false,
    );
    expect(shopeeVerifyPush(key, "https://x.test/api/webhooks/shopee", body, null)).toBe(false);
  });

  it("push parsing: order status / tracking / deauthorization / other", () => {
    expect(
      shopeeConnector.parsePush({
        code: 3,
        shop_id: 777,
        data: { ordersn: "2611ABC", status: "READY_TO_SHIP" },
      }),
    ).toEqual({
      shopId: "777",
      kind: "order",
      orderIds: ["2611ABC"],
    });
    expect(
      shopeeConnector.parsePush({ code: 4, shop_id: 777, data: { ordersn: "X1" } })?.orderIds,
    ).toEqual(["X1"]);
    expect(shopeeConnector.parsePush({ code: 2, shop_id: 777 })?.kind).toBe("deauthorized");
    expect(shopeeConnector.parsePush({ code: 9, shop_id: 777 })?.kind).toBe("other");
    expect(shopeeConnector.parsePush({ code: 3 })).toBeNull();
  });
});

describe("P6.2 Lazada signatures + push", () => {
  it("API signature: sorted params, path prefix, uppercase hex, sign excluded", () => {
    const params = {
      timestamp: "1700000000000",
      app_key: "123456",
      sign_method: "sha256",
      code: "abc",
    };
    const expected = createHmac("sha256", "secret")
      .update("/auth/token/createapp_key123456codeabcsign_methodsha256timestamp1700000000000")
      .digest("hex")
      .toUpperCase();
    expect(lazadaSign("secret", "/auth/token/create", params)).toBe(expected);
    expect(lazadaSign("secret", "/auth/token/create", { ...params, sign: "zzz" })).toBe(expected);
  });

  it("push signature = hmac(secret, appKey + body)", () => {
    const body = '{"seller_id":"1001","message_type":0}';
    const sig = hmacHex("secret", `123456${body}`);
    expect(lazadaVerifyPush("123456", "secret", body, sig)).toBe(true);
    expect(lazadaVerifyPush("123456", "secret", body, sig.toUpperCase())).toBe(true);
    expect(lazadaVerifyPush("123456", "other", body, sig)).toBe(false);
  });

  it("dates, ISO with VN offset, XML escaping", () => {
    expect(lazadaDate("2026-11-18 10:00:00 +0700").toISOString()).toBe("2026-11-18T03:00:00.000Z");
    expect(lazadaDate("2026-11-18T10:00:00+07:00").toISOString()).toBe("2026-11-18T03:00:00.000Z");
    expect(lazadaIso(new Date("2026-11-18T03:00:00.000Z"))).toBe("2026-11-18T10:00:00+07:00");
    expect(xml(`A&B <x> "q"`)).toBe("A&amp;B &lt;x&gt; &quot;q&quot;");
  });

  it("push parsing: trade order status only", () => {
    expect(
      lazadaConnector.parsePush({
        seller_id: "1001",
        message_type: 0,
        data: { trade_order_id: "55001", order_status: "pending" },
      }),
    ).toEqual({ shopId: "1001", kind: "order", orderIds: ["55001"] });
    expect(lazadaConnector.parsePush({ seller_id: "1001", message_type: 3 })?.kind).toBe("other");
    expect(lazadaConnector.parsePush({ message_type: 0 })).toBeNull();
  });
});

describe("P6.2 token encryption + error kinds", () => {
  const prev = process.env.OMNI_TOKEN_KEY;
  beforeEach(() => {
    process.env.OMNI_TOKEN_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    process.env.OMNI_TOKEN_KEY = prev;
  });

  it("round-trips, random IV, tamper / wrong key → null", () => {
    const a = encryptToken("access-token-1");
    const b = encryptToken("access-token-1");
    expect(a).toMatch(/^enc:v1:/);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("access-token-1");
    expect(decryptToken(a.slice(0, -4) + "AAAA")).toBeNull();
    expect(decryptToken("plain")).toBeNull();
    process.env.OMNI_TOKEN_KEY = randomBytes(32).toString("base64");
    expect(decryptToken(a)).toBeNull();
  });

  it("missing key is reported, not silently plaintext", () => {
    process.env.OMNI_TOKEN_KEY = "";
    expect(tokenKeyConfigured()).toBe(false);
    expect(() => encryptToken("x")).toThrow(/OMNI_TOKEN_KEY/);
  });

  it("retryable = rate limit / network only", () => {
    expect(new MarketplaceError("network", "x").retryable).toBe(true);
    expect(new MarketplaceError("rate_limit", "x").retryable).toBe(true);
    expect(new MarketplaceError("auth", "x").retryable).toBe(false);
    expect(new MarketplaceError("invalid", "x").retryable).toBe(false);
  });
});
