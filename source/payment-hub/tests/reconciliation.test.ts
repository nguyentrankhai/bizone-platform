import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  extractTxnCode,
  matchTransactions,
  type HubTxn,
  type PartnerRecord,
} from "@/services/reconciliation/engine";
import {
  StatementError,
  mapColumns,
  parseAmount,
  parseCsv,
  parseStatement,
  parseStatus,
  parseTime,
} from "@/services/reconciliation/statement";
import { vnDayRange, vnYesterday } from "@/server/services/reconciliation.service";

const hub = (id: number, amount: number, over: Partial<HubTxn> = {}): HubTxn => ({
  id,
  txnCode: `TXN-20261109-${String(id).padStart(6, "0")}`,
  amount,
  status: "Success",
  partnerTxnId: `P${id}`,
  paidAt: new Date("2026-11-09T05:00:00Z"),
  inPeriod: true,
  ...over,
});
const rec = (
  code: string | null,
  amount: number,
  over: Partial<PartnerRecord> = {},
): PartnerRecord => ({
  ref: code,
  txnCode: code,
  partnerTxnId: null,
  amount,
  status: "Success",
  ...over,
});

describe("extractTxnCode", () => {
  it("finds the Hub code in every partner reference format", () => {
    expect(extractTxnCode("TXN-20261110-123456")).toBe("TXN-20261110-123456");
    expect(extractTxnCode("TXN-20261110-123456_2")).toBe("TXN-20261110-123456"); // MoMo orderId
    expect(extractTxnCode("261110_TXN20261110123456_3")).toBe("TXN-20261110-123456"); // ZaloPay
    expect(extractTxnCode("CT tu 0011 NGUYEN VAN A TXN20261110123456 FT2611")).toBe(
      "TXN-20261110-123456",
    ); // bank transfer note
    expect(extractTxnCode("TXN202611101234567")).toBeNull(); // 7 digits: not a code
    expect(extractTxnCode("no code")).toBeNull();
    expect(extractTxnCode(null)).toBeNull();
  });
});

describe("matchTransactions", () => {
  it("classifies matched / partner missing / Hub missing / amount mismatch", () => {
    const H = [hub(1, 100_000), hub(2, 200_000), hub(3, 300_000)];
    const P = [
      rec(H[0]!.txnCode, 100_000), // matched by code
      rec(null, 290_000, { partnerTxnId: "P3", ref: "x" }), // by partner id, wrong amount
      rec("TXN-20261109-999999", 50_000), // unknown to the Hub
      rec(null, 70_000, { ref: "chuyen tien" }), // no recognisable reference
    ];
    const { details, summary } = matchTransactions(H, P);
    const by = (s: string) => details.filter((d) => d.matchStatus === s);
    expect(by("Matched").map((d) => d.transactionId)).toEqual([1]);
    expect(by("Unmatched_PaymentHub")).toMatchObject([
      { transactionId: 2, discrepancyAmount: 200_000 },
    ]);
    expect(by("Amount_Mismatch")).toMatchObject([
      {
        transactionId: 3,
        paymenthubAmount: 300_000,
        partnerAmount: 290_000,
        discrepancyAmount: 10_000,
      },
    ]);
    expect(by("Unmatched_Partner").map((d) => d.discrepancyAmount)).toEqual([50_000, 70_000]);
    expect(summary).toMatchObject({
      totalPaymenthub: 3,
      totalAmountPaymenthub: 600_000,
      totalPartner: 4,
      totalAmountPartner: 510_000,
      matchedCount: 1,
      unmatchedPaymenthub: 1,
      unmatchedPartner: 2,
      amountMismatchCount: 1,
      totalDiscrepancy: 200_000 + 10_000 + 50_000 + 70_000,
    });
  });

  it("partner paid but Hub Expired/Failed → Unmatched_Partner on that transaction (late payment)", () => {
    const H = [
      hub(5, 150_000, { status: "Expired", paidAt: null, inPeriod: false, partnerTxnId: null }),
    ];
    const { details, summary } = matchTransactions(H, [rec(H[0]!.txnCode, 150_000)]);
    expect(details).toMatchObject([
      { matchStatus: "Unmatched_Partner", transactionId: 5, paymenthubStatus: "Expired" },
    ]);
    expect(summary.totalPaymenthub).toBe(0);
  });

  it("partner says failed for a Hub payment → Unmatched_PaymentHub with both statuses", () => {
    const H = [hub(6, 80_000)];
    const { details } = matchTransactions(H, [
      rec(H[0]!.txnCode, 80_000, { status: "Failed", statusText: "24" }),
    ]);
    expect(details[0]).toMatchObject({ matchStatus: "Unmatched_PaymentHub", partnerStatus: "24" });
    expect(details[0]!.note).toContain("24");
  });

  it("query failures are Unverified, not discrepancies; failed records of unpaid txns are ignored", () => {
    const H = [
      hub(7, 10_000),
      hub(8, 20_000, { status: "Pending", paidAt: null, inPeriod: false }),
    ];
    const { details, summary } = matchTransactions(H, [
      rec(H[0]!.txnCode, null as unknown as number, {
        status: "Unknown",
        unverified: true,
        amount: null,
      }),
      rec(H[1]!.txnCode, null as unknown as number, { status: "Pending", amount: null }),
    ]);
    expect(details).toMatchObject([{ matchStatus: "Unverified", transactionId: 7 }]);
    expect(summary).toMatchObject({
      unverifiedCount: 1,
      totalDiscrepancy: 0,
      unmatchedPaymenthub: 0,
    });
  });

  it("second partner payment for the same transaction is reported; other-day payments match quietly", () => {
    const H = [hub(9, 40_000), hub(10, 60_000, { inPeriod: false })];
    const { details, summary } = matchTransactions(H, [
      rec(H[0]!.txnCode, 40_000),
      rec(`${H[0]!.txnCode}_2`, 40_000, { txnCode: H[0]!.txnCode }),
      rec(H[1]!.txnCode, 60_000),
    ]);
    expect(details.map((d) => d.matchStatus)).toEqual(["Matched", "Unmatched_Partner", "Matched"]);
    expect(details[2]!.note).toContain("ngày khác");
    expect(summary.totalPaymenthub).toBe(1);
  });

  it("10 000 transactions match in well under a second", () => {
    const H = Array.from({ length: 10_000 }, (_, i) => hub(i + 1, 10_000 + i));
    const P = H.map((t) => rec(t.txnCode, t.amount));
    const t0 = performance.now();
    const { summary } = matchTransactions(H, P);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(summary.matchedCount).toBe(10_000);
  });
});

describe("statement parsing", () => {
  it("maps headers whatever the case / accents / separators", () => {
    expect(mapColumns(["Mã đơn hàng", "Số tiền", "Trạng thái", "Ngày giao dịch", "Mã GD"])).toEqual(
      {
        ref: 0,
        amount: 1,
        status: 2,
        time: 3,
        partnerTxnId: 4,
      },
    );
    expect(mapColumns(["vnp_TxnRef", "vnp_Amount", "vnp_TransactionNo"])).toMatchObject({
      ref: 0,
      amount: 1,
      partnerTxnId: 2,
    });
  });

  it("amounts, statuses and Vietnam-time dates", () => {
    expect(parseAmount("1.500.000")).toBe(1_500_000);
    expect(parseAmount("1,500,000")).toBe(1_500_000);
    expect(parseAmount("1500000.00")).toBe(1_500_000);
    expect(parseAmount("1 500 000 ₫")).toBe(1_500_000);
    expect(parseAmount("150000000", true)).toBe(1_500_000);
    expect(parseAmount("")).toBeNull();
    expect(parseStatus("Thành công")).toBe("Success");
    expect(parseStatus("00")).toBe("Success");
    expect(parseStatus("Thất bại")).toBe("Failed");
    expect(parseStatus("Đang xử lý")).toBe("Pending");
    expect(parseTime("09/11/2026 08:30")?.toISOString()).toBe("2026-11-09T01:30:00.000Z");
    expect(parseTime("20261109083000")?.toISOString()).toBe("2026-11-09T01:30:00.000Z");
    expect(parseTime("2026-11-09")?.toISOString()).toBe("2026-11-08T17:00:00.000Z");
  });

  it("CSV with quotes, BOM, semicolons", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"he said ""hi"""\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'he said "hi"'],
      [""], // blank line kept so row numbers match the file
    ]);
  });

  it("bank statement CSV: title lines, transfer notes, debits skipped", async () => {
    const csv = [
      "SAO KE TAI KHOAN 0011001234567",
      "",
      "Ngày giao dịch,Số tham chiếu,Nội dung,Ghi có",
      '09/11/2026 10:00,FT001,"NGUYEN VAN A CK TXN20261109000001",150.000',
      "09/11/2026 11:00,FT002,Phi dich vu,-11.000",
      "09/11/2026 12:00,FT003,khong co ma,",
    ].join("\n");
    const res = await parseStatement("saoke.csv", Buffer.from(csv));
    expect(res.records).toMatchObject([
      { txnCode: "TXN-20261109-000001", partnerTxnId: "FT001", amount: 150_000, status: "Success" },
    ]);
    expect(res.skipped.map((s) => s.row)).toEqual([5, 6]);
  });

  it("Excel (.xlsx) statement", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("MoMo");
    ws.addRow(["orderId", "transId", "amount", "resultCode"]);
    ws.addRow(["TXN-20261109-000002_2", 4088878653, 200000, 0]);
    ws.addRow(["TXN-20261109-000003", 4088878654, 50000, 1006]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await parseStatement("momo.xlsx", buf);
    expect(res.records).toMatchObject([
      {
        txnCode: "TXN-20261109-000002",
        partnerTxnId: "4088878653",
        amount: 200_000,
        status: "Success",
      },
      { txnCode: "TXN-20261109-000003", status: "Failed", statusText: "1006" },
    ]);
  });

  it("rejects unknown formats and files without the needed columns", async () => {
    await expect(parseStatement("a.pdf", Buffer.from("x"))).rejects.toBeInstanceOf(StatementError);
    await expect(parseStatement("a.csv", Buffer.from("foo,bar\n1,2"))).rejects.toThrow(/tiêu đề/);
  });
});

describe("business day", () => {
  it("Vietnam day boundaries in UTC", () => {
    expect(vnDayRange("2026-11-09")).toEqual({
      start: new Date("2026-11-08T17:00:00Z"),
      end: new Date("2026-11-09T17:00:00Z"),
    });
    expect(vnYesterday(new Date("2026-11-09T17:30:00Z"))).toBe("2026-11-09"); // 00:30 on the 10th VN
  });
});
