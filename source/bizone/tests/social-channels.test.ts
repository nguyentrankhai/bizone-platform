import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MARKETPLACES,
  MARKETPLACE_FEATURES,
  ORDER_MARKETPLACES,
  catalogLink,
  mapMarketStatus,
  mapTiktokStatus,
  normalizeOrderSource,
  plannedTransition,
} from "@/lib/omni/marketplace";
import {
  tiktokPushSign,
  tiktokSign,
  tiktokSignBase,
  tiktokVerifyPush,
} from "@/server/services/omni/tiktok/signing";
import { tiktokConnector } from "@/server/services/omni/tiktok";
import { appSecretProof, facebookConnector } from "@/server/services/omni/facebook";
import { connectorFor } from "@/server/services/omni/marketplace/registry";

const hmacHex = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");

describe("P6.3 channel registry + features", () => {
  it("every platform has a connector with its own code", () => {
    for (const code of MARKETPLACES) expect(connectorFor(code).code).toBe(code);
  });

  it("Meta catalog: no categories, no order import, image URLs, website links", () => {
    expect(MARKETPLACE_FEATURES.facebook).toEqual({
      categories: false,
      orders: false,
      uploadsImages: false,
      linksToWebsite: true,
    });
    expect(ORDER_MARKETPLACES).toEqual(["shopee", "lazada", "tiktok"]);
  });
});

describe("P6.3 TikTok Shop order status", () => {
  it("maps 202309 statuses", () => {
    expect(mapTiktokStatus("UNPAID")).toBe("pending");
    expect(mapTiktokStatus("ON_HOLD")).toBe("confirmed");
    expect(mapTiktokStatus("AWAITING_SHIPMENT")).toBe("confirmed");
    expect(mapTiktokStatus("AWAITING_COLLECTION")).toBe("preparing");
    expect(mapTiktokStatus("PARTIALLY_SHIPPING")).toBe("preparing");
    expect(mapTiktokStatus("IN_TRANSIT")).toBe("shipping");
    expect(mapTiktokStatus("DELIVERED")).toBe("delivered");
    expect(mapTiktokStatus("completed")).toBe("completed");
    expect(mapTiktokStatus("CANCELLED")).toBe("cancelled");
    expect(mapTiktokStatus("SOMETHING_NEW")).toBeNull();
  });

  it("generic mapper dispatches per platform; Meta has none", () => {
    expect(mapMarketStatus("tiktok", { rawStatus: "IN_TRANSIT", statuses: [] })).toBe("shipping");
    expect(mapMarketStatus("shopee", { rawStatus: "SHIPPED", statuses: [] })).toBe("shipping");
    expect(mapMarketStatus("lazada", { rawStatus: "", statuses: ["shipped"] })).toBe("shipping");
    expect(mapMarketStatus("facebook", { rawStatus: "X", statuses: [] })).toBeNull();
    // Cancel while awaiting collection still returns stock the BizOne way
    expect(plannedTransition("preparing", mapTiktokStatus("CANCELLED"))).toBe("cancel");
    expect(plannedTransition("shipping", mapTiktokStatus("CANCELLED"))).toBe("return");
  });
});

describe("P6.3 TikTok Shop signatures + push", () => {
  const secret = "tt-secret-123456";

  it("base string: path + sorted params (no sign / access_token) + body", () => {
    const q = {
      timestamp: "1700000000",
      app_key: "abc",
      shop_cipher: "C1",
      sign: "x",
      access_token: "t",
    };
    expect(tiktokSignBase("/order/202309/orders", q, '{"a":1}')).toBe(
      '/order/202309/ordersapp_keyabcshop_cipherC1timestamp1700000000{"a":1}',
    );
    expect(tiktokSign(secret, "/order/202309/orders", q, '{"a":1}')).toBe(
      hmacHex(
        secret,
        `${secret}/order/202309/ordersapp_keyabcshop_cipherC1timestamp1700000000{"a":1}${secret}`,
      ),
    );
    // multipart uploads: no body in the signature
    expect(tiktokSign(secret, "/p", { app_key: "a", timestamp: "1" }, null)).toBe(
      hmacHex(secret, `${secret}/papp_keyatimestamp1${secret}`),
    );
  });

  it("push signature = hmac(secret, app_key + body), constant-time verify", () => {
    const body = '{"type":1,"shop_id":"7001","data":{"order_id":"5770001"}}';
    const sig = tiktokPushSign("abc", secret, body);
    expect(sig).toBe(hmacHex(secret, `abc${body}`));
    expect(tiktokVerifyPush("abc", secret, body, sig)).toBe(true);
    expect(tiktokVerifyPush("abc", secret, body, sig.toUpperCase())).toBe(true);
    expect(tiktokVerifyPush("abc", secret, body + " ", sig)).toBe(false);
    expect(tiktokVerifyPush("abc", secret, body, null)).toBe(false);
  });

  it("push parsing: order events / deauthorization / other", () => {
    expect(
      tiktokConnector.parsePush({ type: 1, shop_id: "7001", data: { order_id: "577" } }),
    ).toEqual({ shopId: "7001", kind: "order", orderIds: ["577"] });
    expect(
      tiktokConnector.parsePush({ type: 2, shop_id: "7001", data: { order_id: "578" } })?.kind,
    ).toBe("order");
    expect(tiktokConnector.parsePush({ type: 6, shop_id: "7001", data: {} })?.kind).toBe(
      "deauthorized",
    );
    expect(tiktokConnector.parsePush({ type: 5, shop_id: "7001" })?.kind).toBe("other");
    expect(tiktokConnector.parsePush({ type: 1 })).toBeNull();
  });
});

describe("P6.3 TikTok Shop connector (HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubEnv() {
    vi.stubEnv("TIKTOK_APP_KEY", "app123");
    vi.stubEnv("TIKTOK_APP_SECRET", "secret-abcdef");
    vi.stubEnv("TIKTOK_SERVICE_ID", "svc1");
    vi.stubEnv("TIKTOK_API_URL", "https://tt.test");
  }

  it("authorize URL carries service_id + state; configured needs key, secret, service id", () => {
    vi.stubEnv("TIKTOK_APP_KEY", "");
    expect(tiktokConnector.configured()).toBe(false);
    stubEnv();
    expect(tiktokConnector.configured()).toBe(true);
    const url = new URL(tiktokConnector.authorizeUrl("https://x/cb", "st-1"));
    expect(url.searchParams.get("service_id")).toBe("svc1");
    expect(url.searchParams.get("state")).toBe("st-1");
  });

  it("orders: one line item per unit grouped by SKU, cancelled units dropped, signed request", async () => {
    stubEnv();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        const u = new URL(url);
        const q = Object.fromEntries(u.searchParams);
        expect(u.searchParams.get("sign")).toBe(tiktokSign("secret-abcdef", u.pathname, q, null));
        expect((init.headers as Record<string, string>)["x-tts-access-token"]).toBe("tok");
        const li = (sku: string, skuId: string, st = "AWAITING_SHIPMENT") => ({
          id: `${skuId}-${Math.random()}`,
          product_id: "P1",
          product_name: "Áo thun",
          sku_id: skuId,
          sku_name: sku,
          seller_sku: `AO-${sku}`,
          sale_price: "99000",
          display_status: st,
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              orders: [
                {
                  id: "5770001",
                  status: "AWAITING_SHIPMENT",
                  create_time: 1_700_000_000,
                  update_time: 1_700_000_100,
                  is_cod: true,
                  payment: { total_amount: "213000", shipping_fee: "15000" },
                  recipient_address: {
                    name: "Lan",
                    phone_number: "(+84)9****12",
                    full_address: "HN",
                  },
                  line_items: [
                    li("M", "S1"),
                    li("M", "S1"),
                    li("L", "S2"),
                    li("L", "S2", "CANCELLED"),
                  ],
                  tracking_number: "VN123",
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
    const [o] = await tiktokConnector.getOrders(
      { accessToken: "tok", shopId: "7001", shopRef: "CIPH" },
      ["5770001"],
    );
    expect(new URL(calls[0]).searchParams.get("shop_cipher")).toBe("CIPH");
    expect(o.lines).toHaveLength(2);
    expect(o.lines.find((l) => l.modelId === "S1")).toMatchObject({
      quantity: 2,
      sku: "AO-M",
      unitPrice: 99000,
    });
    expect(o.lines.find((l) => l.modelId === "S2")?.quantity).toBe(1);
    expect(o).toMatchObject({
      isCod: true,
      total: 213000,
      shippingFee: 15000,
      trackingCode: "VN123",
    });
  });

  it("token errors (105xxx) are auth errors; HTTP 5xx is retryable", async () => {
    stubEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ code: 105002, message: "Expired credentials" })),
      ),
    );
    await expect(
      tiktokConnector.categories({ accessToken: "t", shopId: "1", shopRef: "c" }),
    ).rejects.toMatchObject({ kind: "auth" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    await expect(
      tiktokConnector.categories({ accessToken: "t", shopId: "1", shopRef: "c" }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});

describe("P6.3 Facebook / Instagram catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("appsecret_proof = hmac(app_secret, token)", () => {
    expect(appSecretProof("s3cret", "tok")).toBe(hmacHex("s3cret", "tok"));
  });

  it("catalog link = website product page + utm_source", () => {
    expect(catalogLink("https://shop.bizone.vn/", "12-ao-thun")).toBe(
      "https://shop.bizone.vn/products/12-ao-thun?utm_source=facebook&utm_medium=catalog",
    );
  });

  it("items_batch: one item per variant grouped by product SKU, VND price, availability", async () => {
    vi.stubEnv("FACEBOOK_APP_ID", "1234567890");
    vi.stubEnv("FACEBOOK_APP_SECRET", "fb-secret-xyz");
    vi.stubEnv("FACEBOOK_GRAPH_URL", "https://graph.test/v21.0");
    let sent: { requests: { method: string; data: Record<string, unknown> }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const u = new URL(url);
        expect(u.pathname).toBe("/v21.0/CAT1/items_batch");
        expect(u.searchParams.get("appsecret_proof")).toBe(hmacHex("fb-secret-xyz", "tok"));
        sent = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ handles: ["h1"], validation_status: [] }));
      }),
    );
    const r = await facebookConnector.createListing(
      { accessToken: "tok", shopId: "CAT1" },
      {
        sku: "AO",
        name: "Áo thun",
        description: "Áo thun cotton",
        categoryId: "",
        price: 99000,
        stock: 0,
        weightKg: 0.5,
        packageCm: { length: 1, width: 1, height: 1 },
        images: [],
        imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
        link: "https://shop/products/1-ao",
        brand: "NoBrand",
        variants: [
          { sku: "AO-M", name: "M", price: 99000, stock: 3 },
          { sku: "AO-L", name: "L", price: 109000, stock: 0 },
        ],
      },
    );
    expect(r).toEqual({
      itemId: "AO",
      models: [
        { sku: "AO-M", modelId: "AO-M" },
        { sku: "AO-L", modelId: "AO-L" },
      ],
    });
    expect(sent!.requests).toHaveLength(2);
    expect(sent!.requests[0].data).toMatchObject({
      id: "AO-M",
      item_group_id: "AO",
      price: "99000 VND",
      availability: "in stock",
      inventory: 3,
      image_link: "https://cdn/a.jpg",
      additional_image_link: ["https://cdn/b.jpg"],
      link: "https://shop/products/1-ao",
    });
    expect(sent!.requests[1].data.availability).toBe("out of stock");
  });

  it("validation errors → per-SKU failure on update; token error 190 → auth", async () => {
    vi.stubEnv("FACEBOOK_APP_SECRET", "fb-secret-xyz");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              handles: ["h"],
              validation_status: [{ retailer_id: "AO-L", errors: [{ message: "Invalid price" }] }],
            }),
          ),
      ),
    );
    const res = await facebookConnector.updateListings({ accessToken: "t", shopId: "C" }, [
      { itemId: "AO", modelId: "AO-M", sku: "AO-M", stock: 2 },
      { itemId: "AO", modelId: "AO-L", sku: "AO-L", price: -1 },
    ]);
    expect(res).toEqual([
      { sku: "AO-M", ok: true },
      { sku: "AO-L", ok: false, error: "Invalid price" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Session expired", code: 190 } }), {
            status: 400,
          }),
      ),
    );
    await expect(
      facebookConnector.updateListings({ accessToken: "t", shopId: "C" }, [
        { itemId: "AO", modelId: null, sku: "AO", stock: 1 },
      ]),
    ).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("P6.3 website order source", () => {
  it("keeps known utm_source values + aliases, drops the rest", () => {
    expect(normalizeOrderSource("facebook")).toBe("facebook");
    expect(normalizeOrderSource(" FB ")).toBe("facebook");
    expect(normalizeOrderSource("ig")).toBe("instagram");
    expect(normalizeOrderSource("zalo.me")).toBe("zalo");
    expect(normalizeOrderSource("newsletter")).toBeNull();
    expect(normalizeOrderSource("")).toBeNull();
    expect(normalizeOrderSource(null)).toBeNull();
  });
});
