import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketLabel,
  bucketsIn,
  buildRevenueReport,
  buildTxnReport,
  comparisonRange,
  defaultGroupBy,
  feeOf,
  growth,
  parseRange,
  parseStatuses,
  presetRange,
  reconDayStatus,
  summarizeRecon,
  toCsv,
  trendMonths,
  vnRangeUtc,
  type ReconDayRow,
  type RevenueAggRow,
} from "@/lib/report";

describe("report ranges (Vietnam days)", () => {
  const now = new Date("2026-11-11T03:00:00Z"); // 10:00 VN

  it("defaults to the last 7 days and validates input", () => {
    expect(parseRange(null, null, now)).toEqual({
      ok: true,
      range: { from: "2026-11-05", to: "2026-11-11" },
    });
    expect(parseRange("2026-11-10", "2026-11-01", now).ok).toBe(false);
    expect(parseRange("2026-02-30", "2026-03-01", now).ok).toBe(false);
    expect(parseRange("11/10/2026", null, now).ok).toBe(false);
    expect(parseRange("2025-01-01", "2026-01-01", now).ok).toBe(true); // 366 days
    expect(parseRange("2024-12-31", "2026-01-01", now).ok).toBe(false);
  });

  it("maps a range to UTC instants (00:00 VN = 17:00 UTC the day before)", () => {
    const { start, end } = vnRangeUtc({ from: "2026-11-01", to: "2026-11-30" });
    expect(start.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-30T17:00:00.000Z");
  });

  it("computes comparison periods", () => {
    expect(comparisonRange({ from: "2026-11-01", to: "2026-11-07" }, "previous")).toEqual({
      from: "2026-10-25",
      to: "2026-10-31",
    });
    expect(comparisonRange({ from: "2026-11-01", to: "2026-11-30" }, "year")).toEqual({
      from: "2025-11-01",
      to: "2025-11-30",
    });
    // 29/02 has no counterpart the year before
    expect(comparisonRange({ from: "2028-02-01", to: "2028-02-29" }, "year")).toEqual({
      from: "2027-02-01",
      to: "2027-02-28",
    });
  });

  it("builds presets from today", () => {
    expect(presetRange("lastMonth", "2026-03-15")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(presetRange("lastMonth", "2026-01-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(presetRange("thisMonth", "2026-11-11")).toEqual({
      from: "2026-11-01",
      to: "2026-11-11",
    });
    expect(presetRange("30days", "2026-11-11").from).toBe("2026-10-13");
  });

  it("buckets days into weeks (Monday) and months", () => {
    expect(bucketKey("2026-11-11", "week")).toBe("2026-11-09"); // Wednesday → Monday
    expect(bucketKey("2026-11-15", "week")).toBe("2026-11-09"); // Sunday → same week
    expect(bucketKey("2026-11-16", "week")).toBe("2026-11-16");
    expect(bucketKey("2026-11-16", "month")).toBe("2026-11");
    expect(bucketLabel("2026-11-09", "week")).toBe("09/11–15/11");
    expect(bucketLabel("2026-11", "month")).toBe("11/2026");
    expect(bucketsIn({ from: "2026-10-30", to: "2026-11-11" }, "week")).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(bucketsIn({ from: "2026-10-30", to: "2026-11-02" }, "day")).toHaveLength(4);
    expect(defaultGroupBy({ from: "2026-11-01", to: "2026-11-30" })).toBe("day");
    expect(defaultGroupBy({ from: "2026-08-01", to: "2026-11-11" })).toBe("week");
    expect(defaultGroupBy({ from: "2026-01-01", to: "2026-11-11" })).toBe("month");
  });

  it("lists the 12 months of the trend across a year boundary", () => {
    const m = trendMonths("2026-03-05");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-04");
    expect(m[11]).toBe("2026-03");
  });
});

describe("filters & numbers", () => {
  it("parses status groups and raw statuses", () => {
    expect(parseStatuses("")).toBeUndefined();
    expect(parseStatuses("paid")?.sort()).toEqual(["PartiallyRefunded", "Refunded", "Success"]);
    expect(parseStatuses("failed,Pending")?.sort()).toEqual(["Expired", "Failed", "Pending"]);
    expect(parseStatuses("Success,DROP TABLE")).toBeNull();
  });

  it("estimates fees and growth", () => {
    expect(feeOf(1_000_000, 1.1, 0)).toBe(11_000);
    expect(feeOf(150_555, 0.8, 1_100)).toBe(1_204 + 1_100);
    expect(growth(110, 100)).toBe(10);
    expect(growth(90, 100)).toBe(-10);
    expect(growth(50, 0)).toBeNull();
  });
});

describe("transaction report", () => {
  it("sums statuses per bucket and fills empty periods", () => {
    const r = buildTxnReport(
      [
        { day: "2026-11-09", status: "Success", count: 3, amount: 300_000, fees: 3_300 },
        { day: "2026-11-09", status: "Failed", count: 1, amount: 50_000, fees: 0 },
        { day: "2026-11-11", status: "PartiallyRefunded", count: 1, amount: 200_000, fees: 2_200 },
        { day: "2026-11-11", status: "Expired", count: 2, amount: 80_000, fees: 0 },
        { day: "2026-11-11", status: "Pending", count: 4, amount: 40_000, fees: 0 },
      ],
      { from: "2026-11-09", to: "2026-11-11" },
      "day",
      {},
    );
    expect(r.summary).toMatchObject({
      total: 11,
      paid: 4,
      failed: 3,
      pending: 4,
      refunded: 1,
      paidAmount: 500_000,
      totalAmount: 670_000,
      fees: 5_500,
      successRate: 57.1,
    });
    expect(r.buckets.map((b) => b.total)).toEqual([4, 0, 7]);
    expect(r.buckets[1].successRate).toBeNull();
    expect(r.buckets[0].successRate).toBe(75);

    const weekly = buildTxnReport(
      [{ day: "2026-11-11", status: "Success", count: 2, amount: 10, fees: 0 }],
      { from: "2026-11-01", to: "2026-11-11" },
      "week",
      {},
    );
    expect(weekly.buckets.map((b) => b.key)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weekly.buckets[2].paid).toBe(2);
  });
});

describe("revenue report", () => {
  const row = (
    connectorType: string | null,
    paymentMethod: string | null,
    gross: number,
    extra: Partial<RevenueAggRow> = {},
  ): RevenueAggRow => ({
    connectorType,
    paymentMethod,
    count: 1,
    gross,
    refunded: 0,
    fees: 0,
    ...extra,
  });

  it("groups by partner and method with share, net and growth", () => {
    const r = buildRevenueReport({
      range: { from: "2026-11-01", to: "2026-11-30" },
      compare: "previous",
      filters: {},
      current: [
        row("VNPay", "vnpay_qr", 600_000, { count: 3, fees: 6_600 }),
        row("VNPay", "vnpay_atm", 200_000, { refunded: 50_000 }),
        row("MoMo", "momo_qr", 200_000, { fees: 4_000 }),
      ],
      previous: [row("VNPay", "vnpay_qr", 400_000), row("ZaloPay", "zalopay_qr", 100_000)],
      trend: [{ month: "2026-11", count: 5, gross: 1_000_000, refunded: 50_000, fees: 10_600 }],
    });
    expect(r.previousRange).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(r.summary).toMatchObject({
      count: 5,
      gross: 1_000_000,
      refunded: 50_000,
      fees: 10_600,
      net: 939_400,
      growth: 100,
    });
    expect(r.byPartner.map((l) => [l.label, l.gross, l.percentage, l.growth])).toEqual([
      ["VNPay", 800_000, 80, 100],
      ["MoMo", 200_000, 20, null],
      // only in the comparison period: listed with 0 so the drop is visible
      ["ZaloPay", 0, 0, -100],
    ]);
    expect(r.byMethod[0]).toMatchObject({ key: "vnpay_qr", label: "VNPay QR", gross: 600_000 });
    expect(r.trend).toHaveLength(12);
    expect(r.trend[11]).toMatchObject({ key: "2026-11", net: 939_400 });
    expect(r.trend[0].gross).toBe(0);
  });
});

describe("reconciliation report", () => {
  const day = (over: Partial<ReconDayRow>): ReconDayRow => ({
    runId: 1,
    date: "2026-11-10",
    partnerConfigId: 1,
    partnerName: "VNPay",
    partner: "VNPay",
    source: "Api",
    totalPaymenthub: 10,
    totalPartner: 10,
    amountPaymenthub: 1_000,
    amountPartner: 1_000,
    matched: 10,
    unmatchedPaymenthub: 0,
    unmatchedPartner: 0,
    amountMismatch: 0,
    unverified: 0,
    discrepancy: 0,
    open: 0,
    ...over,
  });

  it("labels each day and totals the period", () => {
    expect(reconDayStatus(day({}))).toBe("matched");
    expect(reconDayStatus(day({ unmatchedPartner: 1, open: 1 }))).toBe("open");
    expect(reconDayStatus(day({ amountMismatch: 1, open: 0 }))).toBe("resolved");
    expect(reconDayStatus(day({ unverified: 2 }))).toBe("unverified");

    const { summary, daily } = summarizeRecon([
      day({
        runId: 1,
        matched: 8,
        unmatchedPaymenthub: 1,
        amountMismatch: 1,
        discrepancy: 300,
        open: 2,
      }),
      day({ runId: 2, partnerName: "MoMo", matched: 5 }),
      day({ runId: 3, date: "2026-11-09", matched: 7, unmatchedPartner: 1, discrepancy: 100 }),
    ]);
    expect(summary).toMatchObject({
      runs: 3,
      days: 2,
      matched: 20,
      unmatched: 3,
      discrepancy: 400,
      open: 2,
      matchRate: 87,
    });
    expect(daily).toEqual([
      { date: "2026-11-09", runs: 1, matched: 7, unmatched: 1, discrepancy: 100 },
      { date: "2026-11-10", runs: 2, matched: 13, unmatched: 2, discrepancy: 300 },
    ]);
  });
});

describe("CSV", () => {
  it("quotes, keeps numbers raw and neutralises formulas", () => {
    const csv = toCsv(
      ["Mã", "Số tiền", "Ghi chú"],
      [
        ["TXN-1", 150000, 'Khách "VIP", HN'],
        ['=HYPERLINK("x")', -5, null],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Mã,Số tiền,Ghi chú");
    expect(lines[1]).toBe('TXN-1,150000,"Khách ""VIP"", HN"');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",-5,`);
  });
});
