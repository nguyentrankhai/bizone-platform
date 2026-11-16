import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";

// ─── Mocks for the refund route (merchant auth, rate limit, idempotency store, service) ─────────

const idem = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
}));
const svc = vi.hoisted(() => ({ requestRefund: vi.fn() }));

vi.mock("@/server/middleware/apiAuth", () => ({
  ApiAuthError: class extends Error {},
  verifyApiRequest: vi.fn(async () => ({ merchantId: 7, apiKeyId: 3 })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/server/middleware/idempotency", async (orig) => ({
  ...(await orig<typeof import("@/server/middleware/idempotency")>()),
  claimIdempotency: idem.claim,
  completeIdempotency: idem.complete,
  releaseIdempotency: idem.release,
}));
vi.mock("@/server/services/refund.service", async (orig) => ({
  ...(await orig<typeof import("@/server/services/refund.service")>()),
  requestRefund: svc.requestRefund,
}));

import { handleMerchantRefund } from "@/server/routes/refund";
import { RefundError, RefundReservedError, toRefundView } from "@/server/services/refund.service";
import { clientIp, rateLimitClient } from "@/lib/client-ip";
import { zipUncompressedSize } from "@/services/reconciliation/statement";

function refundReq(key?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/transactions/TXN-1/refund", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify({ amount: 50_000, reason: "Khách trả hàng" }),
  });
}

describe("merchant refund idempotency (QA-4 #123)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idem.claim.mockResolvedValue({ kind: "claimed" });
    idem.complete.mockResolvedValue(undefined);
    idem.release.mockResolvedValue(undefined);
  });

  it("requires an Idempotency-Key", async () => {
    const res = await handleMerchantRefund(refundReq(), "TXN-1");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Idempotency-Key/);
    expect(svc.requestRefund).not.toHaveBeenCalled();
  });

  it("keeps the key and answers 202 when the refund was reserved but not recorded", async () => {
    svc.requestRefund.mockRejectedValue(
      new RefundReservedError(
        { id: 9, refundCode: "REF-1", amount: 50_000 },
        "TXN-1",
        new Error("deadlock"),
      ),
    );
    const res = await handleMerchantRefund(refundReq("k1"), "TXN-1");
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.refund).toMatchObject({ refund_code: "REF-1", status: "Processing" });
    expect(idem.release).not.toHaveBeenCalled();
    expect(idem.complete).toHaveBeenCalledWith(
      "refund",
      7,
      "k1",
      expect.any(String),
      202,
      body.data,
    );
  });

  it("releases the key when nothing was reserved", async () => {
    svc.requestRefund.mockRejectedValue(new RefundError("REFUND_AMOUNT_EXCEEDED", "Vượt"));
    const res = await handleMerchantRefund(refundReq("k2"), "TXN-1");
    expect(res.status).toBe(422);
    expect(idem.release).toHaveBeenCalledWith("refund", 7, "k2");
    expect(idem.complete).not.toHaveBeenCalled();
  });

  it("replays a finished request", async () => {
    idem.claim.mockResolvedValue({
      kind: "replay",
      status: 200,
      response: { refund: { status: "Completed" }, transaction: {} },
    });
    const res = await handleMerchantRefund(refundReq("k3"), "TXN-1");
    expect(res.headers.get("Idempotent-Replayed")).toBe("true");
    expect(svc.requestRefund).not.toHaveBeenCalled();
  });
});

describe("refund view for merchants (QA-4 #124)", () => {
  const base = {
    id: 1,
    refundCode: "REF-1",
    amount: 1000,
    status: "Processing",
    reason: "x",
    partnerRefundId: null,
    responseCode: "NO_RESPONSE",
    errorMessage: "Không nhận được phản hồi từ MoMo (connect ECONNREFUSED 10.0.0.5:443)",
    channel: "Merchant",
    processedAt: null,
    createdAt: new Date(),
    transaction: { txnCode: "TXN-1", currency: "VND" },
  } as unknown as Parameters<typeof toRefundView>[0];

  it("hides the raw network error from merchants, keeps it for admins", () => {
    expect(toRefundView(base).message).not.toMatch(/ECONNREFUSED/);
    expect(toRefundView(base, { admin: true }).message).toMatch(/ECONNREFUSED/);
  });
});

describe("client IP (QA-4 #125)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("ignores forwarding headers unless behind a trusted proxy", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }), false)).toBeUndefined();
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), true)).toBe("1.2.3.4");
    expect(clientIp(h({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1" }), true)).toBe(
      "5.5.5.5",
    );
    expect(rateLimitClient(h({ "x-forwarded-for": "9.9.9.9" }))).toBe("untrusted");
  });
});

describe("XLSX inflated size (QA-4 #125)", () => {
  it("reads the uncompressed size of a real workbook", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sao ke");
    ws.addRow(["txn_code", "amount"]);
    for (let i = 0; i < 200; i++) ws.addRow([`TXN-${i}`, 1000 * i]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const size = zipUncompressedSize(buf);
    expect(size).toBeGreaterThan(buf.length); // xml compresses well
    expect(size).toBeLessThan(5 * 1024 * 1024);
  });

  it("flags zip64 / bombs and rejects non-zips", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["a"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    // Patch the first central-directory entry's uncompressed size to 0xFFFFFFFF (zip64 marker)
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buf.writeUInt32LE(0xffffffff, cd + 24);
    expect(zipUncompressedSize(buf)).toBe(Number.POSITIVE_INFINITY);
    expect(zipUncompressedSize(Buffer.from("txn_code,amount\nA,1\n"))).toBeNull();
  });
});
