import { describe, expect, it } from "vitest";
import {
  failureSpikeAlert,
  fillChart,
  methodLabel,
  percentChange,
  periodRange,
  summarize,
  toMethodSlices,
  vnDateKey,
  vnStartOfDay,
} from "@/lib/dashboard";

describe("dashboard periods (Vietnam time, UTC+7)", () => {
  // 2026-11-05 01:30 ICT == 2026-11-04 18:30 UTC
  const now = new Date("2026-11-04T18:30:00Z");

  it("day boundaries follow ICT, not UTC", () => {
    expect(vnDateKey(now)).toBe("2026-11-05");
    expect(vnStartOfDay(now).toISOString()).toBe("2026-11-04T17:00:00.000Z");
  });

  it("today compares with the same time window yesterday", () => {
    const r = periodRange("today", now);
    expect(r.from.toISOString()).toBe("2026-11-04T17:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2026-11-03T17:00:00.000Z");
    expect(r.prevTo.getTime() - r.prevFrom.getTime()).toBe(r.to.getTime() - r.from.getTime());
    // chart still covers 7 days ending today
    expect(r.chartDays).toHaveLength(7);
    expect(r.chartDays[0]).toBe("2026-10-30");
    expect(r.chartDays[6]).toBe("2026-11-05");
  });

  it("7days and 30days include today", () => {
    const w = periodRange("7days", now);
    expect(w.from.toISOString()).toBe("2026-10-29T17:00:00.000Z");
    expect(w.chartDays).toHaveLength(7);
    const m = periodRange("30days", now);
    expect(m.chartDays).toHaveLength(30);
    expect(m.chartDays.at(-1)).toBe("2026-11-05");
    // previous window = same elapsed time, 30 days earlier (no overlap with the current one)
    expect(m.prevTo.getTime()).toBeLessThanOrEqual(m.from.getTime());
    expect(m.prevFrom.toISOString()).toBe("2026-09-06T17:00:00.000Z");
  });
});

describe("dashboard aggregates", () => {
  it("summarize groups statuses and computes success rate over finished txns", () => {
    const s = summarize([
      { status: "Success", count: 8, amount: 800 },
      { status: "PartiallyRefunded", count: 1, amount: 100 },
      { status: "Failed", count: 2, amount: 200 },
      { status: "Expired", count: 1, amount: 50 },
      { status: "Pending", count: 3, amount: 300 },
      { status: "Created", count: 1, amount: 10 },
    ]);
    expect(s).toMatchObject({
      total: 16,
      paid: 9,
      refunded: 1,
      failed: 3,
      expired: 1,
      pending: 4,
      paidAmount: 900,
      totalAmount: 1460,
      successRate: 75,
    });
    expect(summarize([]).successRate).toBeNull();
  });

  it("percentChange handles empty previous window", () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("fillChart adds zero days", () => {
    const out = fillChart(
      ["2026-11-03", "2026-11-04", "2026-11-05"],
      [{ date: "2026-11-04", count: 2, amount: 10, successCount: 1, failedCount: 1 }],
    );
    expect(out.map((p) => p.count)).toEqual([0, 2, 0]);
  });

  it("payment method labels merge connector type and method", () => {
    expect(methodLabel("VNPay", "vnpay_qr")).toBe("VNPay");
    expect(methodLabel(null, "vnpay_atm")).toBe("VNPay");
    expect(methodLabel(null, "vietqr")).toBe("VietQR");
    expect(methodLabel(null, null)).toBe("Chưa chọn");
    const slices = toMethodSlices([
      { connectorType: "VNPay", paymentMethod: "vnpay", count: 2, amount: 20 },
      { connectorType: null, paymentMethod: "vnpay_qr", count: 1, amount: 5 },
      { connectorType: "VietQR", paymentMethod: "vietqr", count: 1, amount: 7 },
    ]);
    expect(slices).toEqual([
      { method: "VNPay", count: 3, amount: 25, percentage: 75 },
      { method: "VietQR", count: 1, amount: 7, percentage: 25 },
    ]);
  });

  it("failure spike alert needs both minimum count and rate", () => {
    expect(failureSpikeAlert({ paid: 0, failed: 4 })).toBeNull(); // too few
    expect(failureSpikeAlert({ paid: 100, failed: 10 })).toBeNull(); // 9.1 % < 30 %
    const a = failureSpikeAlert({ paid: 5, failed: 5 });
    expect(a?.level).toBe("error");
    expect(a?.message).toContain("5/10");
  });
});
