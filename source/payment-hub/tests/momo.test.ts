import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomoConnector, momoApiBase, momoResultPayload } from "@/services/connectors/momo";
import {
  classifyResultCode,
  momoOrderId,
  orderExpireMinutes,
  txnCodeFromOrderId,
} from "@/services/connectors/momo/momo.util";
import type { ConnectorConfig } from "@/services/connectors/types";
import { isBusinessError } from "@/services/routing/routeEngine";
import { amountError, routeFor } from "@/services/routing/routeMap";

const ACCESS = "ACCESSKEY123";
const SECRET = "SECRETKEY456";
const config: ConnectorConfig = {
  partnerConfigId: 1,
  connectorType: "MoMo",
  merchantCode: "MOMOTEST",
  apiKey: ACCESS,
  secretKey: SECRET,
  endpoint: "https://momo.example/v2/gateway/api/create",
  apiEndpoint: "https://momo.example/v2/gateway/api",
  ipnUrl: "https://hub.example/api/ipn/momo",
  environment: "Sandbox",
  timeoutMs: 5000,
};

/** Independent of the connector: the raw string exactly as MoMo documents it. */
const hmac = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

function ipnBody(over: Record<string, string | number> = {}) {
  const b: Record<string, string | number> = {
    partnerCode: "MOMOTEST",
    orderId: "TXN-20261110-ABC123",
    requestId: "req-1",
    amount: 150000,
    orderInfo: "Thanh toan don 1",
    orderType: "momo_wallet",
    transId: 4088878653,
    resultCode: 0,
    message: "Thành công.",
    payType: "qr",
    responseTime: 1762761600000,
    extraData: "",
    ...over,
  };
  const raw =
    `accessKey=${ACCESS}&amount=${b.amount}&extraData=${b.extraData}&message=${b.message}` +
    `&orderId=${b.orderId}&orderInfo=${b.orderInfo}&orderType=${b.orderType}` +
    `&partnerCode=${b.partnerCode}&payType=${b.payType}&requestId=${b.requestId}` +
    `&responseTime=${b.responseTime}&resultCode=${b.resultCode}&transId=${b.transId}`;
  return { ...b, signature: hmac(raw) };
}

function mockFetch(handler: (url: string, body: Record<string, unknown>) => unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      return new Response(JSON.stringify(handler(url, body)), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const momo = new MomoConnector(config);
const payReq = {
  txnCode: "TXN-20261110-ABC123",
  amount: 150000,
  currency: "VND",
  description: "Thanh toán đơn #1 & quà",
  paymentMethod: "momo_qr",
  returnUrl: "https://hub.example/pay/momo/return",
  ipAddress: "127.0.0.1",
  createdAt: new Date(),
  expiredAt: new Date(Date.now() + 15 * 60_000 + 5_000),
};

describe("MoMo signatures", () => {
  it("verifies a genuine IPN and rejects tampering", () => {
    const body = momoResultPayload(ipnBody());
    expect(momo.verifySignature(body, body.signature!)).toBe(true);
    expect(momo.verifySignature({ ...body, amount: "1" }, body.signature!)).toBe(false);
    expect(momo.verifySignature({ ...body, resultCode: "1006" }, body.signature!)).toBe(false);
    expect(momo.verifySignature(body, "00".repeat(32))).toBe(false);
    expect(momo.verifySignature(body, "not-hex")).toBe(false);
    // signed by another merchant's secret / for another partnerCode
    const other = momoResultPayload({ ...ipnBody(), partnerCode: "OTHER" });
    expect(momo.verifySignature(other, other.signature!)).toBe(false);
    const wrongKey = new MomoConnector({ ...config, secretKey: "other" });
    expect(wrongKey.verifySignature(body, body.signature!)).toBe(false);
  });

  it("signs the create request with the documented field order", async () => {
    const calls = mockFetch((_u, b) => ({
      partnerCode: b.partnerCode,
      orderId: b.orderId,
      requestId: b.requestId,
      amount: b.amount,
      resultCode: 0,
      message: "Thành công.",
      payUrl: "https://momo.example/pay?t=abc",
      qrCodeUrl: "momo://app?action=payWithApp&t=abc",
      deeplink: "momo://app?action=payWithApp&t=abc&isScanQR=false",
    }));
    const res = await momo.createTransaction(payReq);
    const b = calls[0]!.body;
    expect(calls[0]!.url).toBe(config.endpoint);
    expect(b).toMatchObject({
      partnerCode: "MOMOTEST",
      orderId: "TXN-20261110-ABC123",
      amount: 150000,
      requestType: "captureWallet",
      ipnUrl: config.ipnUrl,
      redirectUrl: payReq.returnUrl,
      orderExpireTime: 15,
      autoCapture: true,
    });
    expect(String(b.orderInfo)).not.toMatch(/[&=]/);
    const raw =
      `accessKey=${ACCESS}&amount=150000&extraData=&ipnUrl=${config.ipnUrl}` +
      `&orderId=${b.orderId}&orderInfo=${b.orderInfo}&partnerCode=MOMOTEST` +
      `&redirectUrl=${payReq.returnUrl}&requestId=${b.requestId}&requestType=captureWallet`;
    expect(b.signature).toBe(hmac(raw));
    expect(res.paymentUrl).toBe("https://momo.example/pay?t=abc");
    expect(res.partnerQr?.content).toBe("momo://app?action=payWithApp&t=abc");
    expect(res.partnerQr?.deeplink).toContain("isScanQR=false");
    expect(JSON.stringify(res.partnerRequest)).not.toContain(SECRET);
  });
});

describe("MoMo results", () => {
  it("maps resultCode to Core outcomes", () => {
    const ok = momo.processResult(momoResultPayload(ipnBody()));
    expect(ok).toMatchObject({
      txnCode: "TXN-20261110-ABC123",
      outcome: "Success",
      partnerTxnId: "4088878653",
      amount: 150000,
    });
    expect(ok.paidAt?.toISOString()).toBe(new Date(1762761600000).toISOString());

    const denied = momo.processResult(momoResultPayload(ipnBody({ resultCode: 1006 })));
    expect(denied.outcome).toBe("Failed");
    expect(denied.errorCode).toBe("1006");
    expect(denied.errorMessage).toMatch(/từ chối/);

    expect(momo.processResult(momoResultPayload(ipnBody({ resultCode: 1000 }))).outcome).toBe(
      "Pending",
    );
    // API-level error says nothing final about the payment
    expect(momo.processResult(momoResultPayload(ipnBody({ resultCode: 99 }))).outcome).toBe(
      "Pending",
    );
    expect(classifyResultCode(4001)).toBe("failed");
    expect(classifyResultCode(9000)).toBe("pending");
  });

  it("maps regenerated order ids back to the transaction", () => {
    expect(momoOrderId("TXN-20261110-ABC123")).toBe("TXN-20261110-ABC123");
    expect(momoOrderId("TXN-20261110-ABC123", 3)).toBe("TXN-20261110-ABC123_3");
    expect(txnCodeFromOrderId("TXN-20261110-ABC123_3")).toBe("TXN-20261110-ABC123");
    expect(txnCodeFromOrderId("TXN-20261110-ABC123")).toBe("TXN-20261110-ABC123");
    const r = momo.processResult(momoResultPayload(ipnBody({ orderId: "TXN-20261110-ABC123_2" })));
    expect(r.txnCode).toBe("TXN-20261110-ABC123");
  });

  it("computes orderExpireTime from the transaction expiry", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(orderExpireMinutes(new Date("2026-11-10T00:15:00Z"), now)).toBe(15);
    expect(orderExpireMinutes(new Date("2026-11-10T00:00:20Z"), now)).toBe(1);
    expect(orderExpireMinutes(undefined, now)).toBeUndefined();
  });
});

describe("MoMo create errors", () => {
  it("rejects amounts outside captureWallet limits as a business error (no fallback)", async () => {
    const calls = mockFetch(() => ({}));
    const err = await momo.createTransaction({ ...payReq, amount: 500 }).catch((e) => e);
    expect(isBusinessError(err)).toBe(true);
    const big = await momo.createTransaction({ ...payReq, amount: 60_000_000 }).catch((e) => e);
    expect(isBusinessError(big)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(amountError("momo_qr", 999)).toMatch(/tối thiểu/);
    expect(amountError("momo_qr", 50_000_001)).toMatch(/tối đa/);
    expect(amountError("momo_qr", 10_000)).toBeNull();
    expect(amountError("vietqr", 1)).toBeNull();
  });

  it("treats MoMo errors as partner failures and retries a duplicate orderId once", async () => {
    mockFetch(() => ({ resultCode: 13, message: "auth failed" }));
    const err = await momo.createTransaction(payReq).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isBusinessError(err)).toBe(false);
    expect(String(err.message)).toMatch(/13/);

    const calls = mockFetch((_u, b) =>
      b.orderId === "TXN-20261110-ABC123"
        ? { resultCode: 41, message: "Duplicated orderId" }
        : {
            partnerCode: b.partnerCode,
            orderId: b.orderId,
            requestId: b.requestId,
            resultCode: 0,
            payUrl: "https://momo.example/pay?t=x",
          },
    );
    const res = await momo.createTransaction(payReq);
    expect(calls).toHaveLength(2);
    expect(String(calls[1]!.body.orderId)).toMatch(/^TXN-20261110-ABC123_\d+$/);
    expect(res.paymentUrl).toBe("https://momo.example/pay?t=x");
  });

  it("refuses a create response that does not echo the request", async () => {
    mockFetch(() => ({
      partnerCode: "MOMOTEST",
      orderId: "SOMETHING-ELSE",
      requestId: "x",
      resultCode: 0,
      payUrl: "https://evil.example/pay",
    }));
    await expect(momo.createTransaction(payReq)).rejects.toThrow(/does not match/);
  });
});

describe("MoMo query / refund / health", () => {
  it("queries status and requires the response to echo the request", async () => {
    const calls = mockFetch((url, b) => ({
      partnerCode: b.partnerCode,
      orderId: b.orderId,
      requestId: b.requestId,
      resultCode: 0,
      amount: 150000,
      transId: 777,
      message: "ok",
    }));
    const st = await momo.getStatus({
      txnCode: "TXN-1",
      partnerOrderId: "TXN-1_2",
      transactionDate: "",
      ipAddress: "127.0.0.1",
    });
    expect(calls[0]!.url).toBe("https://momo.example/v2/gateway/api/query");
    const b = calls[0]!.body;
    expect(b.signature).toBe(
      hmac(`accessKey=${ACCESS}&orderId=TXN-1_2&partnerCode=MOMOTEST&requestId=${b.requestId}`),
    );
    expect(st).toMatchObject({ outcome: "Success", signatureValid: true, partnerTxnId: "777" });

    mockFetch(() => ({ partnerCode: "MOMOTEST", orderId: "X", requestId: "Y", resultCode: 0 }));
    const forged = await momo.getStatus({ txnCode: "TXN-1", transactionDate: "", ipAddress: "" });
    expect(forged).toMatchObject({ outcome: "Unknown", signatureValid: false });
  });

  it("refunds by transId with the documented signature", async () => {
    const none = mockFetch(() => ({}));
    const skipped = await momo.refund({
      txnCode: "TXN-1",
      amount: 1000,
      type: "full",
      transactionDate: "",
      reason: "x",
      createdBy: "t",
      ipAddress: "",
    });
    expect(skipped.success).toBe(false);
    expect(none).toHaveLength(0);

    const calls = mockFetch((_u, b) => ({
      partnerCode: b.partnerCode,
      orderId: b.orderId,
      requestId: b.requestId,
      amount: b.amount,
      transId: 99001,
      resultCode: 0,
      message: "Thành công.",
    }));
    const res = await momo.refund({
      txnCode: "TXN-1",
      amount: 50000,
      type: "partial",
      partnerTxnId: "4088878653",
      transactionDate: "",
      reason: "khach tra hang",
      createdBy: "admin",
      ipAddress: "",
    });
    const b = calls[0]!.body;
    expect(calls[0]!.url).toBe("https://momo.example/v2/gateway/api/refund");
    expect(b.transId).toBe(4088878653);
    expect(b.signature).toBe(
      hmac(
        `accessKey=${ACCESS}&amount=50000&description=${b.description}&orderId=${b.orderId}` +
          `&partnerCode=MOMOTEST&requestId=${b.requestId}&transId=4088878653`,
      ),
    );
    expect(res).toMatchObject({ success: true, partnerRefundId: "99001", responseCode: "0" });
  });

  it("health check: 42 (order not found) = credentials OK, 13 = rejected", async () => {
    mockFetch((_u, b) => ({ ...b, signature: undefined, resultCode: 42, message: "not found" }));
    expect((await momo.healthCheck()).healthy).toBe(true);
    mockFetch((_u, b) => ({ ...b, signature: undefined, resultCode: 13, message: "auth" }));
    const bad = await momo.healthCheck();
    expect(bad.healthy).toBe(false);
    expect(bad.message).toMatch(/13/);
  });

  it("derives the API base from the create URL and routes momo_qr to MoMo", () => {
    expect(momoApiBase("https://test-payment.momo.vn/v2/gateway/api/create")).toBe(
      "https://test-payment.momo.vn/v2/gateway/api",
    );
    expect(routeFor("momo_qr")).toMatchObject({ connectorType: "MoMo", kind: "redirect" });
  });
});
