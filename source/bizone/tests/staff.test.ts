import { describe, expect, it } from "vitest";
import { hasPermission, roleCapabilities } from "@/lib/rbac";
import { capabilitiesOf, systemRolePermissionCodes, PERMISSION_CATALOG } from "@/lib/permissions";
import { dateKeysBetween, vnMonthRange, vnWallTime } from "@/lib/vn-time";
import { evaluateDay, mergeWindows } from "@/server/services/attendance.service";
import { shiftWindow, toDbTime } from "@/server/services/shift.service";
import {
  buildCategoryScope,
  calculateCommissions,
  type CalcInvoice,
  type CalcRule,
} from "@/server/services/commission.service";
import { previousMonth } from "@/server/queue/commission";
import type { AuthUser } from "@/types/auth";

const user = (roles: string[]): AuthUser => ({
  id: "u1",
  username: "u",
  tenantId: "tenant_demo",
  roles,
  resourceRoles: {},
  expiresAt: 0,
});

describe("permissions", () => {
  it("custom-role capabilities extend token roles", () => {
    const caps = capabilitiesOf(["staff.manage_shift", "product.update", "supplier.read", "nope"]);
    expect([...caps].sort()).toEqual(["product:write", "staff:manage_shift"]);
    const seller = user(["bizone-seller"]);
    expect(hasPermission(seller, "staff:manage_shift")).toBe(false);
    expect(hasPermission(seller, "staff:manage_shift", caps)).toBe(true);
  });
  it("system role catalog mirrors the Keycloak role", () => {
    const seller = systemRolePermissionCodes("seller", roleCapabilities);
    expect(seller).toContain("pos.cancel_invoice");
    expect(seller).not.toContain("product.update");
    expect(systemRolePermissionCodes("admin", roleCapabilities)).toHaveLength(
      PERMISSION_CATALOG.length,
    );
    expect(systemRolePermissionCodes("custom_x", roleCapabilities)).toEqual([]);
  });
  it("warehouse role can manage stock but not sell", () => {
    const wh = user(["bizone-warehouse"]);
    expect(hasPermission(wh, "inventory:write")).toBe(true);
    expect(hasPermission(wh, "pos:write")).toBe(false);
  });
});

describe("VN dates", () => {
  it("month range starts at 00:00 VN", () => {
    const { start, end } = vnMonthRange("2026-12");
    expect(start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
  it("previous month wraps the year", () => {
    expect(previousMonth(new Date("2027-01-01T01:00:00+07:00"))).toBe("2026-12");
    expect(previousMonth(new Date("2026-12-31T23:30:00+07:00"))).toBe("2026-11");
  });
  it("lists date keys inclusive", () => {
    expect(dateKeysBetween("2026-11-30", "2026-12-02")).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });
});

describe("attendance", () => {
  const day = "2026-11-09";
  const morning = shiftWindow(toDbTime("08:00"), toDbTime("12:00"));
  const at = (hhmm: string, date = day) => {
    const [h, m] = hhmm.split(":").map(Number);
    return vnWallTime(date, h * 60 + m);
  };
  const base = { dateKey: day, graceMinutes: 5, now: at("23:00") };

  it("on time within the grace period", () => {
    const r = evaluateDay({
      ...base,
      window: morning,
      checkIn: at("08:04"),
      checkOut: at("12:00"),
    });
    expect(r).toEqual({ status: "present", lateMinutes: 0, earlyMinutes: 0, workedMinutes: 236 });
  });
  it("late and early leave report full minutes", () => {
    const r = evaluateDay({
      ...base,
      window: morning,
      checkIn: at("08:20"),
      checkOut: at("11:30"),
    });
    expect(r.status).toBe("late_early");
    expect(r.lateMinutes).toBe(20);
    expect(r.earlyMinutes).toBe(30);
  });
  it("absent only after the shift ended", () => {
    expect(
      evaluateDay({ ...base, window: morning, checkIn: null, checkOut: null, now: at("10:00") })
        .status,
    ).toBe("scheduled");
    expect(evaluateDay({ ...base, window: morning, checkIn: null, checkOut: null }).status).toBe(
      "absent",
    );
    expect(evaluateDay({ ...base, window: null, checkIn: null, checkOut: null }).status).toBe(
      "off",
    );
  });
  it("overnight shift ends the next day", () => {
    const night = shiftWindow(toDbTime("22:00"), toDbTime("06:00"));
    expect(night).toEqual({ startMin: 1320, endMin: 1800 });
    const r = evaluateDay({
      ...base,
      window: night,
      checkIn: at("22:00"),
      checkOut: at("05:50", "2026-11-10"),
      now: at("12:00", "2026-11-10"),
    });
    expect(r).toMatchObject({ status: "early_leave", earlyMinutes: 10, workedMinutes: 470 });
  });
  it("merges several shifts into one window", () => {
    expect(mergeWindows([morning, { startMin: 780, endMin: 1020 }])).toEqual({
      startMin: 480,
      endMin: 1020,
    });
    expect(mergeWindows([])).toBeNull();
  });
});

describe("commissions", () => {
  const item = (o: Partial<CalcInvoice["items"][number]>) => ({
    productId: 1,
    categoryId: 10,
    quantity: 2,
    refundedQuantity: 0,
    lineTotal: 200_000,
    refundedAmount: 0,
    costPrice: 60_000,
    ...o,
  });
  const rule = (o: Partial<CalcRule>): CalcRule => ({
    id: 1,
    type: "percent_revenue",
    value: 2,
    productId: null,
    categoryId: null,
    minRevenue: null,
    ...o,
  });
  const scope = buildCategoryScope(
    [
      { id: 10, parentId: null },
      { id: 11, parentId: 10 },
      { id: 12, parentId: 11 },
      { id: 20, parentId: null },
    ],
    [10, 20],
  );

  it("percent of revenue shares the invoice discount", () => {
    // 200k + 100k items, invoice total 270k (10% off) → revenue 270k → 2% = 5.400
    const inv: CalcInvoice = {
      id: 1,
      ratio: 0.9,
      items: [item({}), item({ productId: 2, lineTotal: 100_000, quantity: 1 })],
    };
    const r = calculateCommissions([inv], [rule({})], scope);
    expect(r.monthRevenue).toBe(270_000);
    expect(r.lines).toEqual([{ invoiceId: 1, ruleId: 1, amount: 5_400 }]);
  });
  it("percent of profit, fixed per product, refunds", () => {
    const inv: CalcInvoice = {
      id: 7,
      ratio: 1,
      items: [item({ refundedQuantity: 1, refundedAmount: 100_000 })],
    };
    const r = calculateCommissions(
      [inv],
      [
        rule({ id: 2, type: "percent_profit", value: 10 }),
        rule({ id: 3, type: "fixed_per_product", value: 5_000 }),
      ],
      scope,
    );
    // kept 1 unit: revenue 100k, profit 40k → 4.000; fixed 1 × 5.000
    expect(r.lines).toEqual([
      { invoiceId: 7, ruleId: 2, amount: 4_000 },
      { invoiceId: 7, ruleId: 3, amount: 5_000 },
    ]);
  });
  it("category rules include sub-categories; product rules match one product", () => {
    const inv: CalcInvoice = {
      id: 3,
      ratio: 1,
      items: [item({ categoryId: 12 }), item({ productId: 9, categoryId: 20, lineTotal: 50_000 })],
    };
    const r = calculateCommissions(
      [inv],
      [rule({ id: 4, categoryId: 10 }), rule({ id: 5, productId: 9, value: 10 })],
      scope,
    );
    expect(r.lines).toEqual([
      { invoiceId: 3, ruleId: 4, amount: 4_000 },
      { invoiceId: 3, ruleId: 5, amount: 5_000 },
    ]);
  });
  it("min revenue gates the whole month", () => {
    const inv: CalcInvoice = { id: 1, ratio: 1, items: [item({})] };
    expect(calculateCommissions([inv], [rule({ minRevenue: 500_000 })], scope).lines).toEqual([]);
    expect(
      calculateCommissions(
        [inv, { ...inv, id: 2 }, { ...inv, id: 3 }],
        [rule({ minRevenue: 500_000 })],
        scope,
      ).lines,
    ).toHaveLength(3);
  });
  it("items without cost never earn profit commission; losses do not go negative", () => {
    const inv: CalcInvoice = {
      id: 1,
      ratio: 1,
      items: [item({ costPrice: null }), item({ productId: 2, costPrice: 150_000 })],
    };
    expect(
      calculateCommissions([inv], [rule({ type: "percent_profit", value: 10 })], scope).lines,
    ).toEqual([]);
  });
});
