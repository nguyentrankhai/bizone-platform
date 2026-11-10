import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRefundAmount,
  evaluateRefund,
  formatRefundCode,
  refundCheckDelayMs,
  statusAfterRefund,
  type RefundFacts,
} from "@/lib/refund";
import { outcomeOf } from "@/server/services/refund.service";
import { refundCapability } from "@/services/connectors/registry";
import { MomoConnector } from "@/services/connectors/momo";
import { VnpayConnector } from "@/services/connectors/vnpay";
import { ZalopayConnector } from "@/services/connectors/zalopay";
import type { ConnectorConfig, RefundRequest } from "@/services/connectors/types";
import { canTransition } from "@/server/services/stateMachine";

const NOW = new Date("2026-11-10T08:00:00Z");
const paid = (over: Partial<RefundFacts> = {}): RefundFacts => ({
  status: "Success",
  amount: 1_500_000,
  refundedAmount: 0,
  inflightAmount: 0,
  paidAt: new Date("2026-11-09T08:00:00Z"),
  partner: "MoMo",
  partnerTxnId: "4088878653",
  capability: { partial: true, windowDays: 30 },
  ...over,
});

describe("refund eligibility", () => {
  it("allows a paid transaction within the window", () => {
    const e = evaluateRefund(paid(), NOW);
    expect(e).toMatchObject({ refundable: true, refundableAmount: 1_500_000, partial: true });
    expect(e.windowEndsAt?.toISOString()).toBe("2026-12-09T08:00:00.000Z");
  });

  it("rejects unpaid / fully refunded transactions", () => {
    for (const status of ["Created", "Pending", "Failed", "Expired"]) {
      expect(evaluateRefund(paid({ status }), NOW).code).toBe("TRANSACTION_NOT_REFUNDABLE");
    }
    const done = evaluateRefund(paid({ status: "Refunded", refundedAmount: 1_500_000 }), NOW);
    expect(done).toMatchObject({ refundable: false, code: "TRANSACTION_NOT_REFUNDABLE" });
  });

  it("rejects partners without refund API and payments without partner txn id", () => {
    expect(evaluateRefund(paid({ capability: null, partner: "VietQR" }), NOW)).toMatchObject({
      refundable: false,
      code: "REFUND_NOT_SUPPORTED",
      supported: false,
    });
    expect(evaluateRefund(paid({ partnerTxnId: null }), NOW).code).toBe("REFUND_NOT_SUPPORTED");
  });

  it("enforces the refund window", () => {
    const old = paid({ paidAt: new Date("2026-10-01T00:00:00Z") });
    expect(evaluateRefund(old, NOW).code).toBe("REFUND_WINDOW_EXPIRED");
    expect(evaluateRefund(paid({ paidAt: null }), NOW).code).toBe("REFUND_WINDOW_EXPIRED");
  });

  it("subtracts completed and in-flight refunds", () => {
    const e = evaluateRefund(
      paid({ status: "PartiallyRefunded", refundedAmount: 500_000, inflightAmount: 300_000 }),
      NOW,
    );
    expect(e).toMatchObject({ refundable: true, refundableAmount: 700_000 });
    const blocked = evaluateRefund(paid({ inflightAmount: 1_500_000 }), NOW);
    expect(blocked).toMatchObject({ refundable: false, code: "REFUND_IN_PROGRESS" });
  });
});

describe("refund amount", () => {
  it("defaults to everything refundable; full only for the whole paid amount", () => {
    expect(checkRefundAmount(evaluateRefund(paid(), NOW))).toEqual({
      ok: true,
      amount: 1_500_000,
      type: "full",
    });
    const after = evaluateRefund(
      paid({ status: "PartiallyRefunded", refundedAmount: 500_000 }),
      NOW,
    );
    expect(checkRefundAmount(after)).toEqual({ ok: true, amount: 1_000_000, type: "partial" });
    expect(checkRefundAmount(evaluateRefund(paid(), NOW), 500_000)).toEqual({
      ok: true,
      amount: 500_000,
      type: "partial",
    });
  });

  it("never exceeds the original amount across partial refunds", () => {
    const e = evaluateRefund(paid({ status: "PartiallyRefunded", refundedAmount: 1_000_000 }), NOW);
    const res = checkRefundAmount(e, 600_000);
    expect(res).toMatchObject({ ok: false, code: "REFUND_AMOUNT_EXCEEDED" });
    expect(res.ok === false && res.details).toMatchObject({
      refundable: 500_000,
      refunded: 1_000_000,
    });
    expect(checkRefundAmount(e, 500_000)).toMatchObject({ ok: true, amount: 500_000 });
  });

  it("rejects invalid amounts and partial refunds on full-only partners", () => {
    const e = evaluateRefund(paid(), NOW);
    expect(checkRefundAmount(e, 0)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(checkRefundAmount(e, 10.5)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    const fullOnly = evaluateRefund(paid({ capability: { partial: false, windowDays: 30 } }), NOW);
    expect(checkRefundAmount(fullOnly, 100_000)).toMatchObject({
      ok: false,
      code: "REFUND_NOT_SUPPORTED",
    });
    expect(checkRefundAmount(fullOnly)).toMatchObject({ ok: true, type: "full" });
  });

  it("transaction status follows the accumulated amount", () => {
    expect(statusAfterRefund(1_500_000, 500_000)).toBe("PartiallyRefunded");
    expect(statusAfterRefund(1_500_000, 1_500_000)).toBe("Refunded");
    expect(canTransition("Success", "PartiallyRefunded")).toBe(true);
    expect(canTransition("Success", "Refunded")).toBe(true);
    expect(canTransition("PartiallyRefunded", "Refunded")).toBe(true);
    expect(canTransition("Refunded", "PartiallyRefunded")).toBe(false);
  });

  it("refund code and poll back-off", () => {
    // 2026-11-10 20:00 UTC = 2026-11-11 03:00 in Vietnam
    expect(formatRefundCode(new Date("2026-11-10T20:00:00Z"), "AB12CD")).toBe(
      "REF-20261111-AB12CD",
    );
    expect([0, 1, 2, 3, 10].map(refundCheckDelayMs)).toEqual([
      60_000, 120_000, 240_000, 480_000, 3_600_000,
    ]);
  });
});

describe("registry capability", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("VNPay / MoMo / ZaloPay refund, VietQR does not; window from env", () => {
    expect(refundCapability("VNPay")).toMatchObject({ partial: true, windowDays: 30 });
    expect(refundCapability("ZaloPay")).toMatchObject({ async: true });
    expect(refundCapability("VietQR")).toBeNull();
    expect(refundCapability(null)).toBeNull();
    vi.stubEnv("REFUND_WINDOW_DAYS", "7");
    expect(refundCapability("MoMo")?.windowDays).toBe(7);
  });
});

describe("PSP answer → refund outcome", () => {
  const base = { signatureValid: true, partnerRequest: {}, partnerRaw: {} };
  it("success / pending / refused / no answer", () => {
    expect(
      outcomeOf(
        { ...base, success: true, responseCode: "0", message: "ok", partnerRefundId: "9" },
        undefined,
        "MoMo",
      ),
    ).toMatchObject({ kind: "completed", partnerRefundId: "9" });
    expect(
      outcomeOf(
        {
          ...base,
          success: false,
          pending: true,
          partnerRefundRef: "r1",
          responseCode: "3/1",
          message: "x",
        },
        undefined,
        "ZaloPay",
      ),
    ).toMatchObject({ kind: "processing", partnerRefundRef: "r1" });
    expect(
      outcomeOf(
        { ...base, success: false, responseCode: "1080", message: "Hoàn tiền thất bại" },
        undefined,
        "MoMo",
      ),
    ).toMatchObject({ kind: "failed", responseCode: "1080" });
    expect(
      outcomeOf(undefined, new Error("The operation was aborted due to timeout"), "VNPay"),
    ).toMatchObject({
      kind: "processing",
      responseCode: "NO_RESPONSE",
    });
  });
});

// ─── Connectors: ambiguous refund answers are "pending", never "failed" ─────

const cfg = (connectorType: string, over: Partial<ConnectorConfig> = {}): ConnectorConfig => ({
  partnerConfigId: 1,
  connectorType,
  merchantCode: "554",
  apiKey: "KEY1",
  secretKey: "KEY2",
  endpoint: "https://psp.example/v2/create",
  apiEndpoint: "https://psp.example/v2",
  environment: "Sandbox",
  timeoutMs: 5000,
  ...over,
});
const req: RefundRequest = {
  txnCode: "TXN-1",
  amount: 50_000,
  type: "partial",
  partnerTxnId: "123456",
  transactionDate: "20261110100000",
  reason: "khach tra hang",
  createdBy: "admin",
  ipAddress: "127.0.0.1",
};

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const sent = JSON.parse(init.body) as Record<string, unknown>;
      const payload = typeof body === "function" ? (body as (b: unknown) => unknown)(sent) : body;
      return new Response(JSON.stringify(payload), { status });
    }),
  );
}

describe("connector refund classification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("MoMo: 7000 / 43 / HTTP 503 → pending; 1080 → failed", async () => {
    const momo = new MomoConnector(cfg("MoMo", { merchantCode: "MOMOTEST" }));
    const echo = (code: number) => (b: Record<string, unknown>) => ({
      partnerCode: b.partnerCode,
      orderId: b.orderId,
      requestId: b.requestId,
      resultCode: code,
    });
    respond(200, echo(7000));
    expect(await momo.refund(req)).toMatchObject({ success: false, pending: true });
    respond(200, echo(43));
    expect((await momo.refund(req)).pending).toBe(true);
    respond(503, { message: "busy" });
    expect(await momo.refund(req)).toMatchObject({ pending: true, responseCode: "HTTP_503" });
    respond(200, echo(1080));
    const refused = await momo.refund(req);
    expect(refused.success).toBe(false);
    expect(refused.pending).toBeUndefined();
  });

  it("VNPay: unsigned 00 → pending; 94 → pending; 03 → failed", async () => {
    const vnpay = new VnpayConnector(cfg("VNPay", { merchantCode: "TMNCODE1" }));
    respond(200, { vnp_ResponseCode: "00", vnp_Message: "ok", vnp_SecureHash: "bad" });
    expect(await vnpay.refund(req)).toMatchObject({ success: false, pending: true });
    respond(200, { vnp_ResponseCode: "94", vnp_Message: "dup" });
    expect((await vnpay.refund(req)).pending).toBe(true);
    respond(200, { vnp_ResponseCode: "03", vnp_Message: "Invalid data format" });
    const refused = await vnpay.refund(req);
    expect(refused).toMatchObject({ success: false, responseCode: "03" });
    expect(refused.pending).toBeUndefined();
  });

  it("ZaloPay: HTTP 502 → pending with m_refund_id to query later", async () => {
    const zalo = new ZalopayConnector(cfg("ZaloPay"));
    respond(502, { message: "bad gateway" });
    const res = await zalo.refund(req);
    expect(res).toMatchObject({ success: false, pending: true });
    expect(res.partnerRefundRef).toMatch(/^\d{6}_554_/);
  });
});
