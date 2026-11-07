import { describe, expect, it } from "vitest";
import {
  bucketsOf,
  changePct,
  comparisonRange,
  periodLength,
  toTotals,
} from "@/server/services/report.service";
import { exportFileName, formatCell } from "@/server/services/reportExport.service";
import { reportFilterSchema } from "@/lib/validators/report";

describe("comparison periods", () => {
  it("previous period has the same length, right before", () => {
    expect(comparisonRange("2026-11-01", "2026-11-07", "previous_period")).toEqual({
      from: "2026-10-25",
      to: "2026-10-31",
    });
    expect(comparisonRange("2026-03-01", "2026-03-31", "previous_period")).toEqual({
      from: "2026-01-29",
      to: "2026-02-28",
    });
  });
  it("same period last year clamps 29 Feb", () => {
    expect(comparisonRange("2028-02-01", "2028-02-29", "previous_year")).toEqual({
      from: "2027-02-01",
      to: "2027-02-28",
    });
  });
  it("none disables comparison", () => {
    expect(comparisonRange("2026-11-01", "2026-11-07", "none")).toBeNull();
  });
  it("period length is inclusive", () => {
    expect(periodLength("2026-11-01", "2026-11-01")).toBe(1);
    expect(periodLength("2026-01-01", "2026-12-31")).toBe(365);
  });
});

describe("buckets and maths", () => {
  it("days up to 62, months beyond", () => {
    expect(bucketsOf("2026-11-01", "2026-11-07")).toMatchObject({ unit: "day" });
    const y = bucketsOf("2025-11-08", "2026-11-07");
    expect(y.unit).toBe("month");
    expect(y.keys).toHaveLength(13);
    expect(y.keys[0]).toBe("2025-11");
  });
  it("change percentage", () => {
    expect(changePct(110, 100)).toBe(10);
    expect(changePct(50, 200)).toBe(-75);
    expect(changePct(10, 0)).toBeNull();
    expect(changePct(-50, -100)).toBe(50);
  });
  it("totals derive profit, margin and average", () => {
    const t = toTotals({
      gross: "1000",
      discount: "100",
      refunds: "0",
      net: "900",
      cost: "600",
      qty: "3",
      invoices: BigInt(2),
      no_cost_lines: 0,
    });
    expect(t).toMatchObject({
      net: 900,
      profit: 300,
      margin: 33.3,
      avgPerInvoice: 450,
      invoices: 2,
    });
    expect(toTotals(undefined)).toMatchObject({ net: 0, margin: null, avgPerInvoice: 0 });
  });
});

describe("filters and export formatting", () => {
  it("rejects reversed and over-long ranges", () => {
    expect(reportFilterSchema.safeParse({ from: "2026-11-07", to: "2026-11-01" }).success).toBe(
      false,
    );
    expect(reportFilterSchema.safeParse({ from: "2025-01-01", to: "2026-11-01" }).success).toBe(
      false,
    );
    expect(reportFilterSchema.parse({ from: "2026-11-01", to: "2026-11-07" }).compare).toBe(
      "previous_period",
    );
  });
  it("formats cells in Vietnamese", () => {
    expect(formatCell(1234567, "money")).toBe("1.234.567₫");
    expect(formatCell(12.5, "pct")).toBe("12,5%");
    expect(formatCell(null, "pct")).toBe("—");
    expect(formatCell("2026-11-07", "date")).toBe("07/11/2026");
    expect(formatCell("2026-11", "date")).toBe("11/2026");
  });
  it("export file names carry type and period", () => {
    expect(
      exportFileName({
        type: "revenue",
        format: "pdf",
        filter: { from: "2026-11-01", to: "2026-11-07", compare: "none" },
      }),
    ).toBe("bao-cao-revenue-2026-11-01_2026-11-07.pdf");
  });
});
