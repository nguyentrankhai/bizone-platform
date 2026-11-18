import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseStoreKeys, slugFromHost } = await import("@/lib/store");
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
