import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZalopayConnector, parseCallbackData, zalopayApiBase } from "@/services/connectors/zalopay";
import {
  classifyQuery,
  expireDurationSeconds,
  txnCodeFromAppTransId,
  vnYymmdd,
  zalopayAppTransId,
  zalopayRefundId,
} from "@/services/connectors/zalopay/zalopay.util";
import { definitionForCode } from "@/services/connectors/registry";
import type { ConnectorConfig } from "@/services/connectors/types";
import { isBusinessError } from "@/services/routing/routeEngine";
import { routeFor } from "@/services/routing/routeMap";

const APP_ID = "2553";
const KEY1 = "KEY1-request-signing";
const KEY2 = "KEY2-callback-verify";
const config: ConnectorConfig = {
  partnerConfigId: 1,
  connectorType: "ZaloPay",
  merchantCode: APP_ID,
  apiKey: KEY1,
  secretKey: KEY2,
  endpoint: "https://zp.example/v2/create",
  apiEndpoint: "https://zp.example/v2",
  ipnUrl: "https://hub.example/api/ipn/zalopay",
  environment: "Sandbox",
  timeoutMs: 5000,
};

/** Independent of the connector: HMAC-SHA256 hex exactly as ZaloPay documents it. */
const mac = (key: string, raw: string) => createHmac("sha256", key).update(raw).digest("hex");

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const zp = new ZalopayConnector(config);
const TXN = "TXN-20261110-123456";
const payReq = (over: Record<string, unknown> = {}) => ({
  txnCode: TXN,
  amount: 150000,
  currency: "VND",
  description: "Thanh toán đơn #1\nquà",
  paymentMethod: "zalopay_qr",
  returnUrl: "https://hub.example/pay/zalopay/return",
  ipAddress: "127.0.0.1",
  createdAt: new Date(),
  expiredAt: new Date(Date.now() + 15 * 60_000),
  ...over,
});

function callbackData(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    app_id: 2553,
    app_trans_id: `261110_TXN20261110123456`,
    app_time: 1762761600000,
    app_user: "PaymentHub",
    amount: 150000,
    embed_data: '{"redirecturl":"https://hub.example/pay/zalopay/return"}',
    item: "[]",
    zp_trans_id: 251110000012345,
    server_time: 1762761660000,
    channel: 38,
    merchant_user_id: "u1",
    user_fee_amount: 0,
    discount_amount: 0,
    ...over,
  });
}

describe("ZaloPay app_trans_id", () => {
  it("starts with yymmdd in Vietnam time and maps back to the txn_code", () => {
    // 2026-11-10 18:30 UTC = 2026-11-11 01:30 GMT+7
    const late = new Date("2026-11-10T18:30:00Z");
    expect(vnYymmdd(late)).toBe("261111");
    const id = zalopayAppTransId(TXN, 1, late);
    expect(id).toBe("261111_TXN20261110123456");
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/^[0-9A-Za-z_]+$/);
    expect(txnCodeFromAppTransId(id)).toBe(TXN);
    expect(txnCodeFromAppTransId(zalopayAppTransId(TXN, 3, late))).toBe(TXN);
    expect(txnCodeFromAppTransId(zalopayAppTransId(TXN, 4_501_234, late))).toBe(TXN);
  });

  it("builds m_refund_id as yymmdd_appid_unique", () => {
    expect(zalopayRefundId(APP_ID, new Date("2026-11-10T03:00:00Z"))).toMatch(
      /^261110_2553_\d{16}$/,
    );
  });

  it("never lets the ZaloPay order outlive the transaction", () => {
    const now = new Date("2026-11-10T03:00:00Z");
    expect(expireDurationSeconds(new Date(now.getTime() + 900_000), now)).toBe(900);
    expect(expireDurationSeconds(new Date(now.getTime() + 90 * 86400_000), now)).toBe(2_592_000);
    expect(expireDurationSeconds(undefined, now)).toBeUndefined();
  });
});

describe("ZaloPay create order", () => {
  it("signs app_id|app_trans_id|app_user|amount|app_time|embed_data|item with key1", async () => {
    const calls = mockFetch((_url, b) => ({
      return_code: 1,
      return_message: "Giao dịch thành công",
      sub_return_code: 1,
      order_url: "https://qcgateway.zalopay.vn/openinapp?order=abc",
      zp_trans_token: "tok",
      order_token: "tok",
      qr_code:
        "00020101021226520010vn.zalopay0203001010627000503173307089089161731338580010A000000727012800069704540114990191243620190208QRIBFTTA5303704540615000053037045802VN6304ABCD",
      echo: b.app_trans_id,
    }));
    const res = await zp.createTransaction(payReq());
    const body = calls[0]!.body;
    expect(calls[0]!.url).toBe("https://zp.example/v2/create");
    expect(body.app_id).toBe(2553);
    expect(body.amount).toBe(150000);
    expect(body.callback_url).toBe("https://hub.example/api/ipn/zalopay");
    expect(body.description).toBe("Thanh toán đơn #1 quà");
    expect(body.expire_duration_seconds).toBeGreaterThanOrEqual(899);
    expect(body.expire_duration_seconds).toBeLessThanOrEqual(900);
    expect(JSON.parse(String(body.embed_data))).toEqual({
      redirecturl: "https://hub.example/pay/zalopay/return",
      preferred_payment_method: ["zalopay_wallet"],
    });
    const raw = [
      body.app_id,
      body.app_trans_id,
      body.app_user,
      body.amount,
      body.app_time,
      body.embed_data,
      body.item,
    ].join("|");
    expect(body.mac).toBe(mac(KEY1, raw));
    expect(txnCodeFromAppTransId(String(body.app_trans_id))).toBe(TXN);
    expect(res.paymentUrl).toBe("https://qcgateway.zalopay.vn/openinapp?order=abc");
    expect(res.partnerQr?.content).toMatch(/^000201/);
    expect(res.partnerRequest.app_trans_id).toBe(body.app_trans_id);
    expect(JSON.stringify(res.partnerRequest)).not.toContain(KEY1);
  });

  it("rejects a transaction with < 5 minutes left and bad input as business errors", async () => {
    const calls = mockFetch(() => ({}));
    for (const req of [
      payReq({ expiredAt: new Date(Date.now() + 120_000) }),
      payReq({ currency: "USD" }),
      payReq({ paymentMethod: "momo_qr" }),
      payReq({ amount: 0 }),
    ]) {
      const err = await zp.createTransaction(req).catch((e: unknown) => e);
      expect(isBusinessError(err)).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it("-401 is a business error; -402 / -500 are partner failures; -68 retries once", async () => {
    mockFetch(() => ({ return_code: 2, sub_return_code: -401, return_message: "x" }));
    expect(isBusinessError(await zp.createTransaction(payReq()).catch((e) => e))).toBe(true);

    mockFetch(() => ({ return_code: 2, sub_return_code: -402, return_message: "x" }));
    const e402 = await zp.createTransaction(payReq()).catch((e) => e);
    expect(isBusinessError(e402)).toBe(false);
    expect(String(e402.message)).toContain("-402");

    let n = 0;
    const calls = mockFetch(() =>
      ++n === 1
        ? { return_code: 2, sub_return_code: -68 }
        : { return_code: 1, sub_return_code: 1, order_url: "https://zp.example/pay" },
    );
    const ok = await zp.createTransaction(payReq());
    expect(ok.paymentUrl).toBe("https://zp.example/pay");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.app_trans_id).not.toBe(calls[0]!.body.app_trans_id);
    expect(txnCodeFromAppTransId(String(calls[1]!.body.app_trans_id))).toBe(TXN);

    mockFetch(() => ({ return_code: 1, sub_return_code: 1, order_url: "" }));
    await expect(zp.createTransaction(payReq())).rejects.toThrow(/order_url/);
  });
});

describe("ZaloPay callback / redirect", () => {
  it("verifies the callback mac (key2 over data) and the app_id", () => {
    const data = callbackData();
    expect(zp.verifySignature({ data }, mac(KEY2, data))).toBe(true);
    expect(zp.verifySignature({ data }, mac(KEY1, data))).toBe(false); // wrong key
    const tampered = data.replace("150000", "1500");
    expect(zp.verifySignature({ data: tampered }, mac(KEY2, data))).toBe(false);
    const other = callbackData({ app_id: 999 });
    expect(zp.verifySignature({ data: other }, mac(KEY2, other))).toBe(false);
    expect(zp.verifySignature({ data }, "")).toBe(false);
  });

  it("maps callback data to a successful payment", () => {
    const fields = parseCallbackData(callbackData())!;
    const r = zp.processResult(fields);
    expect(r).toMatchObject({
      txnCode: TXN,
      outcome: "Success",
      partnerTxnId: "251110000012345",
      amount: 150000,
    });
    expect(r.paidAt?.getTime()).toBe(1762761660000);
    expect(parseCallbackData("not json")).toBeNull();
    expect(parseCallbackData("[1]")).toBeNull();
  });

  it("verifies the redirect checksum and never treats it as more than display", () => {
    const q: Record<string, string> = {
      appid: APP_ID,
      apptransid: "261110_TXN20261110123456",
      pmcid: "38",
      bankcode: "",
      amount: "150000",
      discountamount: "0",
      status: "1",
    };
    const checksum = mac(
      KEY2,
      `${q.appid}|${q.apptransid}|${q.pmcid}|${q.bankcode}|${q.amount}|${q.discountamount}|${q.status}`,
    );
    expect(zp.verifySignature(q, checksum)).toBe(true);
    expect(zp.verifySignature({ ...q, status: "-49" }, checksum)).toBe(false);
    expect(zp.verifySignature({ ...q, appid: "1" }, checksum)).toBe(false);
    expect(zp.processResult(q)).toMatchObject({ txnCode: TXN, outcome: "Success" });
    expect(zp.processResult({ ...q, status: "-49" }).outcome).toBe("Failed");
  });
});

describe("ZaloPay query / refund / health", () => {
  it("classifies query results without failing on API errors", () => {
    expect(classifyQuery(1, 1)).toBe("success");
    expect(classifyQuery(3, 0)).toBe("pending");
    expect(classifyQuery(2, -54)).toBe("failed");
    expect(classifyQuery(2, -63)).toBe("failed");
    expect(classifyQuery(2, -1331)).toBe("failed");
    for (const sub of [-401, -402, -429, -500, -999, -101, -92]) {
      expect(classifyQuery(2, sub)).toBe("unknown");
    }
    expect(classifyQuery(0, 0)).toBe("unknown");
  });

  it("queries with mac(app_id|app_trans_id|key1) and maps back to the transaction", async () => {
    const calls = mockFetch(() => ({
      return_code: 1,
      sub_return_code: 1,
      is_processing: false,
      amount: 150000,
      zp_trans_id: 251110000012345,
      server_time: 1762761660000,
    }));
    const id = "261110_TXN20261110123456_2";
    const s = await zp.getStatus({
      txnCode: TXN,
      partnerOrderId: id,
      transactionDate: "",
      ipAddress: "1",
    });
    expect(calls[0]!.url).toBe("https://zp.example/v2/query");
    expect(calls[0]!.body).toEqual({
      app_id: 2553,
      app_trans_id: id,
      mac: mac(KEY1, `2553|${id}|${KEY1}`),
    });
    expect(s).toMatchObject({
      outcome: "Success",
      signatureValid: true,
      partnerTxnId: "251110000012345",
    });
    const raw = Object.fromEntries(
      Object.entries(s.partnerRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
    expect(zp.processResult(raw)).toMatchObject({
      txnCode: TXN,
      outcome: "Success",
      amount: 150000,
    });

    mockFetch(() => ({ return_code: 2, sub_return_code: -54, sub_return_message: "expired" }));
    const failed = await zp.getStatus({ txnCode: TXN, transactionDate: "", ipAddress: "1" });
    expect(failed.outcome).toBe("Failed");
    const fr = zp.processResult(
      Object.fromEntries(
        Object.entries(failed.partnerRaw as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ]),
      ),
    );
    expect(fr).toMatchObject({ txnCode: TXN, outcome: "Failed", amount: 0 });
    expect(fr.errorMessage).toContain("hết hạn");

    mockFetch(() => ({ return_code: 3, sub_return_code: 0, is_processing: true }));
    expect(
      (await zp.getStatus({ txnCode: TXN, transactionDate: "", ipAddress: "1" })).outcome,
    ).toBe("Pending");
    mockFetch(() => ({ return_code: 2, sub_return_code: -402 }));
    expect(
      (await zp.getStatus({ txnCode: TXN, transactionDate: "", ipAddress: "1" })).outcome,
    ).toBe("Unknown");
  });

  it("refunds by zp_trans_id with the documented mac, then asks for the refund status", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/refund")
        ? { return_code: 3, sub_return_code: 1, refund_id: 987654 }
        : { return_code: 1, sub_return_code: 1 },
    );
    const r = await zp.refund({
      txnCode: TXN,
      amount: 50000,
      type: "partial",
      partnerTxnId: "251110000012345",
      transactionDate: "",
      reason: "doi tra",
      createdBy: "admin",
      ipAddress: "1",
    });
    const rb = calls[0]!.body;
    expect(calls[0]!.url).toBe("https://zp.example/v2/refund");
    expect(String(rb.m_refund_id)).toMatch(/^\d{6}_2553_\d+$/);
    expect(rb.mac).toBe(mac(KEY1, `2553|251110000012345|50000|${rb.description}|${rb.timestamp}`));
    const qb = calls[1]!.body;
    expect(calls[1]!.url).toBe("https://zp.example/v2/query_refund");
    expect(qb.m_refund_id).toBe(rb.m_refund_id);
    expect(qb.mac).toBe(mac(KEY1, `2553|${rb.m_refund_id}|${qb.timestamp}`));
    expect(r).toMatchObject({
      success: true,
      partnerRefundId: "987654",
      partnerRefundRef: rb.m_refund_id,
    });

    mockFetch((url) =>
      url.endsWith("/refund")
        ? { return_code: 1, sub_return_code: 1, refund_id: 1 }
        : { return_code: 3, sub_return_code: 0 },
    );
    const pending = await zp.refund({
      txnCode: TXN,
      amount: 1000,
      type: "partial",
      partnerTxnId: "1",
      transactionDate: "",
      reason: "",
      createdBy: "a",
      ipAddress: "1",
    });
    expect(pending).toMatchObject({ success: false, pending: true });

    mockFetch(() => ({ return_code: 2, sub_return_code: -13 }));
    const late = await zp.refund({
      txnCode: TXN,
      amount: 1000,
      type: "full",
      partnerTxnId: "1",
      transactionDate: "",
      reason: "",
      createdBy: "a",
      ipAddress: "1",
    });
    expect(late).toMatchObject({ success: false, responseCode: "2/-13" });

    const calls2 = mockFetch(() => ({}));
    const missing = await zp.refund({
      txnCode: TXN,
      amount: 1000,
      type: "full",
      transactionDate: "",
      reason: "",
      createdBy: "a",
      ipAddress: "1",
    });
    expect(missing.responseCode).toBe("MISSING_ZP_TRANS_ID");
    expect(calls2).toHaveLength(0);
  });

  it("health check: order not found = credentials OK, -402 = rejected", async () => {
    mockFetch(() => ({ return_code: 2, sub_return_code: -101 }));
    expect((await zp.healthCheck()).healthy).toBe(true);
    mockFetch(() => ({ return_code: 2, sub_return_code: -402, sub_return_message: "mac" }));
    const bad = await zp.healthCheck();
    expect(bad.healthy).toBe(false);
    expect(bad.message).toContain("-402");
  });

  it("registers zalopay for zalopay_qr with callback + status sync", () => {
    expect(zalopayApiBase("https://sb-openapi.zalopay.vn/v2/create")).toBe(
      "https://sb-openapi.zalopay.vn/v2",
    );
    expect(routeFor("zalopay_qr")).toMatchObject({ connectorType: "ZaloPay", kind: "redirect" });
    const def = definitionForCode("zalopay");
    expect(def?.connectorType).toBe("ZaloPay");
    expect(def?.statusSync).toBe(true);
    expect(def?.defaultIpnUrl).toMatch(/\/api\/ipn\/zalopay$/);
  });
});
