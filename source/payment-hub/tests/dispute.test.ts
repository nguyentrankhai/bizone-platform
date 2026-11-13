import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  MAX_DISPUTES_PER_TXN,
  answerEffect,
  canTransition,
  checkAttachment,
  checkEmailList,
  disputeEligibility,
  formatDisputeCode,
  isOpen,
  parseEmailList,
  sanitizeFileName,
} from "@/lib/dispute";
import {
  buildDisputeResultMail,
  buildPartnerDisputeMail,
  type DisputeMailInput,
} from "@/lib/dispute-mail";
import { signS3Request } from "@/lib/storage";
import { buildDisputePayload } from "@/server/services/webhook.service";
import { disputeApiSupported } from "@/services/connectors/registry";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

describe("dispute code & eligibility", () => {
  it("formats DSP-YYYYMMDD-XXXXXX in Vietnam time", () => {
    // 2026-11-12 18:30 UTC = 13/11 01:30 in Vietnam
    expect(formatDisputeCode(new Date("2026-11-12T18:30:00Z"), "AB12CD")).toBe(
      "DSP-20261113-AB12CD",
    );
  });

  it("allows any transaction that reached a partner, highlights error states", () => {
    expect(disputeEligibility("Created", 0)).toMatchObject({ allowed: false, highlight: false });
    expect(disputeEligibility("Failed", 0)).toMatchObject({ allowed: true, highlight: true });
    expect(disputeEligibility("Expired", 3)).toMatchObject({ allowed: true, highlight: true });
    expect(disputeEligibility("Pending", 0)).toMatchObject({ allowed: true, highlight: true });
    expect(disputeEligibility("Success", 1)).toMatchObject({ allowed: true, highlight: false });
    expect(disputeEligibility("Refunded", 0).allowed).toBe(true);
  });

  it("caps the number of disputes per transaction", () => {
    const e = disputeEligibility("Failed", MAX_DISPUTES_PER_TXN);
    expect(e.allowed).toBe(false);
    expect(e.reason).toContain(String(MAX_DISPUTES_PER_TXN));
  });

  it("never reopens a closed dispute", () => {
    expect(canTransition("Pending", "Processing")).toBe(true);
    expect(canTransition("Pending", "Resolved")).toBe(true);
    expect(canTransition("Processing", "Processing")).toBe(true);
    expect(canTransition("Processing", "Rejected")).toBe(true);
    expect(canTransition("Resolved", "Processing")).toBe(false);
    expect(canTransition("Rejected", "Resolved")).toBe(false);
    expect(isOpen("Pending") && isOpen("Processing")).toBe(true);
    expect(isOpen("Resolved") || isOpen("Rejected")).toBe(false);
  });
});

describe("attachments", () => {
  it("accepts allowed types whose content matches the extension", () => {
    expect(checkAttachment("bien-ban.png", 1000, PNG)).toMatchObject({
      ok: true,
      ext: "png",
      contentType: "image/png",
    });
    expect(checkAttachment("Sao kê.PDF", 2000, PDF)).toMatchObject({
      ok: true,
      fileName: "Sao kê.pdf", // extension normalized to lower case
      ext: "pdf",
    });
    expect(checkAttachment("ghi-chu.txt", 10, new Uint8Array([0x61]))).toMatchObject({ ok: true });
  });

  it("refuses unknown types, renamed binaries, empty and oversized files", () => {
    expect(checkAttachment("virus.exe", 100, EXE)).toMatchObject({ ok: false });
    expect(checkAttachment("hoa-don.pdf", 100, EXE)).toMatchObject({
      ok: false,
      message: expect.stringContaining("không đúng định dạng"),
    });
    expect(checkAttachment("anh.png", 0, PNG)).toMatchObject({ ok: false, message: "Tệp rỗng" });
    expect(checkAttachment("anh.png", ATTACHMENT_MAX_BYTES + 1, PNG)).toMatchObject({ ok: false });
    expect(checkAttachment("khong-duoi", 10, PNG)).toMatchObject({ ok: false });
  });

  it("sanitizes file names (path, control / special characters) but keeps Vietnamese", () => {
    expect(sanitizeFileName("C:\\Users\\a\\Biên bản <1>.png")).toBe("Biên bản _1_.png");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..hidden.pdf")).toBe("hidden.pdf");
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`)).toHaveLength(124);
  });
});

describe("e-mail lists", () => {
  it("parses and validates partner dispute addresses", () => {
    expect(parseEmailList(" Tra-Soat@VNPay.vn; hotro@vnpay.vn, tra-soat@vnpay.vn ,bad")).toEqual([
      "tra-soat@vnpay.vn",
      "hotro@vnpay.vn",
    ]);
    expect(checkEmailList("")).toBeNull();
    expect(checkEmailList("a@b.vn, c@d.vn")).toBeNull();
    expect(checkEmailList("a@b.vn, khong-hop-le")).toContain("khong-hop-le");
    expect(checkEmailList("1@a.vn,2@a.vn,3@a.vn,4@a.vn,5@a.vn,6@a.vn")).toContain("Tối đa 5");
  });
});

describe("partner answers", () => {
  it("maps submit / query answers to the dispute state", () => {
    expect(answerEffect({ accepted: false, message: "Sai mã GD" })).toEqual({
      kind: "refused",
      message: "Sai mã GD",
    });
    expect(answerEffect({ accepted: true, message: "Đã tiếp nhận" })).toEqual({
      kind: "processing",
      message: "Đã tiếp nhận",
    });
    expect(answerEffect({ accepted: true, status: "Processing" }).kind).toBe("processing");
    expect(
      answerEffect({ accepted: true, status: "Resolved", resolution: "Đã hoàn tiền cho khách" }),
    ).toEqual({ kind: "final", status: "Resolved", resolution: "Đã hoàn tiền cho khách" });
    expect(answerEffect({ accepted: true, status: "Rejected" })).toEqual({
      kind: "final",
      status: "Rejected",
      resolution: "Đối tác từ chối tra soát",
    });
  });

  it("no current connector has a dispute API (sent by e-mail or recorded manually)", () => {
    for (const t of ["VNPay", "MoMo", "ZaloPay", "VietQR", null]) {
      expect(disputeApiSupported(t)).toBe(false);
    }
  });
});

const MAIL: DisputeMailInput = {
  disputeCode: "DSP-20261113-AB12CD",
  reason: "Khách bị trừ tiền <script>alert(1)</script>",
  description: "Dòng 1\nDòng 2",
  status: "Resolved",
  resolution: "Đối tác đã hoàn tiền & gửi biên bản",
  partnerRef: "VNP-CASE-77",
  createdBy: "ops@payhub.vn",
  resolvedBy: "lead@payhub.vn",
  txn: {
    txnCode: "TXN-20261113-ABCDEF",
    partnerTxnId: "14512345",
    merchantTxnId: "BZ-1",
    amount: 1_250_000,
    currency: "VND",
    status: "Failed",
    paymentMethod: "vnpay_atm",
    createdAt: new Date("2026-11-13T02:00:00Z"),
    paidAt: null,
  },
  partner: { name: "VNPay Sandbox", connectorType: "VNPay", merchantCode: "TMN01" },
  merchant: { code: "BIZONE", name: "BizOne" },
  attachmentNames: ["sao-ke.pdf", "anh.png"],
  link: "http://localhost:4000/disputes/7",
};

describe("dispute e-mails", () => {
  it("partner e-mail carries the identifiers, escapes HTML and lists the evidence", () => {
    const m = buildPartnerDisputeMail(MAIL);
    expect(m.subject).toBe("[Tra soát] DSP-20261113-AB12CD — GD 14512345 (TMN01)");
    expect(m.text).toContain("TXN-20261113-ABCDEF");
    expect(m.text).toContain("1.250.000 ₫");
    expect(m.text).toContain("13/11/2026"); // Vietnam time
    expect(m.text).toContain("sao-ke.pdf, anh.png");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("Dòng 1<br>Dòng 2");
  });

  it("result e-mail shows the outcome, resolution and link", () => {
    const m = buildDisputeResultMail(MAIL);
    expect(m.subject).toBe("[Payment Hub] Tra soát DSP-20261113-AB12CD — Đã giải quyết");
    expect(m.text).toContain("Đối tác đã hoàn tiền & gửi biên bản");
    expect(m.html).toContain("Đối tác đã hoàn tiền &amp; gửi biên bản");
    expect(m.text).toContain("http://localhost:4000/disputes/7");
  });
});

describe("dispute.resolved webhook payload", () => {
  it("describes the result for the merchant", () => {
    const payload = buildDisputePayload({
      disputeCode: "DSP-20261113-AB12CD",
      status: "Rejected",
      reason: "Khách khiếu nại",
      resolution: "Giao dịch hợp lệ",
      partnerRef: null,
      createdAt: new Date("2026-11-13T01:00:00Z"),
      resolvedAt: new Date("2026-11-13T05:00:00Z"),
      updatedAt: new Date("2026-11-13T05:00:00Z"),
      transaction: {
        txnCode: "TXN-1",
        merchantTxnId: "ORDER-9",
        amount: 50_000,
        currency: "VND",
        status: "Success",
        partnerConfig: { connectorType: "MoMo" },
      },
    } as unknown as Parameters<typeof buildDisputePayload>[0]);
    expect(payload).toEqual({
      event: "dispute.resolved",
      dispute_code: "DSP-20261113-AB12CD",
      transaction_id: "TXN-1",
      merchant_txn_id: "ORDER-9",
      amount: 50_000,
      currency: "VND",
      partner: "MoMo",
      status: "Rejected",
      reason: "Khách khiếu nại",
      resolution: "Giao dịch hợp lệ",
      partner_ref: null,
      created_at: "2026-11-13T01:00:00.000Z",
      resolved_at: "2026-11-13T05:00:00.000Z",
      transaction_status: "Success",
    });
  });
});

describe("storage", () => {
  it("signs S3 requests with SigV4 (scope, signed headers, payload hash)", () => {
    const h = signS3Request(
      { region: "us-east-1", accessKey: "AKIDEXAMPLE", secretKey: "secret" },
      {
        method: "PUT",
        host: "localhost:9000",
        path: "/payment-hub/disputes/DSP-1/a.png",
        body: Buffer.from("abc"),
        now: new Date("2026-11-13T01:02:03.456Z"),
      },
    );
    expect(h["x-amz-date"]).toBe("20261113T010203Z");
    expect(h["x-amz-content-sha256"]).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261113\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it("local driver stores, reads, deletes and rejects unsafe keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "payhub-storage-"));
    dirs.push(dir);
    vi.stubEnv("STORAGE_DRIVER", "local");
    vi.stubEnv("STORAGE_LOCAL_DIR", dir);
    const g = globalThis as unknown as { payhubStorage?: unknown };
    delete g.payhubStorage;
    const { getStorage } = await import("@/lib/storage");
    const s = getStorage();
    expect(s.name).toBe("local");
    await s.put("disputes/DSP-1/x.png", Buffer.from("hello"), "image/png");
    expect((await s.get("disputes/DSP-1/x.png"))?.body.toString()).toBe("hello");
    await s.delete("disputes/DSP-1/x.png");
    expect(await s.get("disputes/DSP-1/x.png")).toBeNull();
    await expect(s.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow();
    await expect(s.get("/etc/passwd")).rejects.toThrow();
    delete g.payhubStorage;
    vi.unstubAllEnvs();
  });
});
