import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseStoreKeys, slugFromHost, matchHost, storeBaseUrl } = await import("@/lib/store");
const { safeNext } = await import("@/lib/safe-next");
const { parsePaymentReturn } = await import("@/lib/paymentHubClient");

describe("store resolution", () => {
  it("parses STORE_KEYS", () => {
    const m = parseStoreKeys(" demo=bzs.tenant_demo.abc , Shop-2=bzs.t2.xyz,bad, =x,ok=");
    expect([...m]).toEqual([
      ["demo", "bzs.tenant_demo.abc"],
      ["shop-2", "bzs.t2.xyz"],
    ]);
  });

  it("takes the sub-domain of the root domain or localhost", () => {
    expect(slugFromHost("demo.bizone.vn", "bizone.vn")).toBe("demo");
    expect(slugFromHost("demo.localhost:3100", "bizone.vn")).toBe("demo");
    expect(slugFromHost("localhost:3100", "bizone.vn")).toBeNull();
    expect(slugFromHost("a.b.bizone.vn", "bizone.vn")).toBeNull();
    expect(slugFromHost("evil.com", "bizone.vn")).toBeNull();
    expect(slugFromHost(null, "bizone.vn")).toBeNull();
  });
});

describe("store public URL (#156)", () => {
  it("uses the store's sub-domain with the configured scheme / port", () => {
    const prod = "https://shop.bizone.vn";
    expect(storeBaseUrl(matchHost("shopa.bizone.vn", "bizone.vn"), prod)).toBe(
      "https://shopa.bizone.vn",
    );
    expect(
      storeBaseUrl(matchHost("demo.localhost:3100", "bizone.vn"), "http://localhost:3100/"),
    ).toBe("http://demo.localhost:3100");
  });

  it("falls back to STOREFRONT_URL for the default store", () => {
    expect(storeBaseUrl(matchHost("localhost:3100", "bizone.vn"), "http://localhost:3100/")).toBe(
      "http://localhost:3100",
    );
    expect(storeBaseUrl(null, undefined)).toBe("http://localhost:3100");
  });
});

describe("safe next path (#158)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/orders/WEB-1?x=1")).toBe("/orders/WEB-1?x=1");
    expect(safeNext("/")).toBe("/");
  });

  it("rejects paths that leave the site", () => {
    for (const v of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "/ /evil",
      "/\t/evil",
      "",
      "account",
    ])
      expect(safeNext(v)).toBe("/account");
  });
});

describe("Payment Hub return", () => {
  it("reads the order and the browser-side result only", () => {
    expect(
      parsePaymentReturn({
        order: "WEB-20261118-000123",
        result: "success",
        txn_code: "TXN-1",
        status: "Success",
      }),
    ).toEqual({ orderCode: "WEB-20261118-000123", txnCode: "TXN-1", result: "success" });
    expect(parsePaymentReturn({ order: "../x", result: "hacked" })).toEqual({
      orderCode: null,
      txnCode: null,
      result: null,
    });
  });
});
