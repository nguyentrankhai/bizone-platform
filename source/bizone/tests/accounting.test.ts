import { describe, expect, it } from "vitest";
import {
  agingBucket,
  applyMovement,
  categoryAccepts,
  daysOverdue,
  directionOf,
  docCode,
  nextSeq,
  nonPnlCategoryIds,
  profitAndLoss,
  subtreeIds,
  wouldCycle,
} from "@/lib/accounting/calc";
import {
  createFundSchema,
  createRecordSchema,
  fundLedgerSchema,
  transferSchema,
} from "@/lib/validators/accounting";
import { capabilitiesOf } from "@/lib/permissions";
import { hasPermission } from "@/lib/rbac";
import { slugCode } from "@/server/services/ledger.service";
import type { AuthUser } from "@/types/auth";

describe("fund movements", () => {
  it("receipt raises and payment lowers the balance", () => {
    expect(directionOf("revenue")).toBe("in");
    expect(directionOf("expense")).toBe("out");
    expect(applyMovement(1_000_000, "in", 250_000)).toBe(1_250_000);
    expect(applyMovement(1_000_000, "out", 250_000)).toBe(750_000);
  });

  it("refuses to take a fund below zero unless allowed", () => {
    expect(() => applyMovement(100_000, "out", 100_001)).toThrow(/không đủ số dư/);
    expect(applyMovement(100_000, "out", 100_000)).toBe(0);
    expect(applyMovement(100_000, "out", 150_000, true)).toBe(-50_000);
  });

  it("rejects zero / negative amounts and keeps 2 decimals", () => {
    expect(() => applyMovement(0, "in", 0)).toThrow();
    expect(() => applyMovement(0, "in", -5)).toThrow();
    expect(applyMovement(0.1, "in", 0.2)).toBe(0.3);
  });
});

describe("document codes", () => {
  it("PT/PC + yymmdd + 4-digit sequence", () => {
    expect(docCode("revenue", "2026-11-10", 1)).toBe("PT2611100001");
    expect(docCode("expense", "2026-01-05", 42)).toBe("PC2601050042");
  });

  it("continues the sequence of the same day only", () => {
    expect(nextSeq(null, "PT261110")).toBe(1);
    expect(nextSeq("PT2611100007", "PT261110")).toBe(8);
    expect(nextSeq("PT2611090007", "PT261110")).toBe(1);
  });
});

describe("categories", () => {
  const cats = [
    { id: 1, parentId: null, code: "expense_purchase" },
    { id: 2, parentId: 1, code: "hang_tet" },
    { id: 3, parentId: null, code: "expense_rent" },
    { id: 4, parentId: 3, code: "thue_kho" },
    { id: 5, parentId: 4, code: "thue_kho_q7" },
    { id: 6, parentId: null, code: "revenue_debt_collection" },
  ];

  it("subtree includes every descendant", () => {
    expect(subtreeIds(cats, 3).sort()).toEqual([3, 4, 5]);
    expect(subtreeIds(cats, 5)).toEqual([5]);
  });

  it("detects cycles when moving a category", () => {
    expect(wouldCycle(cats, 3, 5)).toBe(true);
    expect(wouldCycle(cats, 3, 3)).toBe(true);
    expect(wouldCycle(cats, 5, 1)).toBe(false);
    expect(wouldCycle(cats, 5, null)).toBe(false);
  });

  it("purchases and debt collections (with children) stay out of the P&L", () => {
    expect([...nonPnlCategoryIds(cats)].sort()).toEqual([1, 2, 6]);
  });

  it("a category of type both accepts receipts and payments", () => {
    expect(categoryAccepts("both", "revenue")).toBe(true);
    expect(categoryAccepts("expense", "revenue")).toBe(false);
    expect(categoryAccepts("expense", "expense")).toBe(true);
  });

  it("builds a code from a Vietnamese name", () => {
    expect(slugCode("Tiền điện thoại")).toBe("tien_dien_thoai");
    expect(slugCode("Đồ dùng văn phòng!!")).toBe("do_dung_van_phong");
    expect(slugCode("???")).toBe("danh_muc");
  });
});

describe("profit and loss", () => {
  it("revenue − costs = profit", () => {
    const p = profitAndLoss({
      netSales: 10_000_000,
      cogs: 6_000_000,
      otherIncome: 500_000,
      expenses: 2_000_000,
    });
    expect(p.grossProfit).toBe(4_000_000);
    expect(p.revenue).toBe(10_500_000);
    expect(p.totalCost).toBe(8_000_000);
    expect(p.netProfit).toBe(p.revenue - p.totalCost);
    expect(p.netProfit).toBe(2_500_000);
    expect(p.netMargin).toBe(23.8);
  });

  it("reports a loss and no margin without revenue", () => {
    const p = profitAndLoss({ netSales: 0, cogs: 0, otherIncome: 0, expenses: 300_000 });
    expect(p.netProfit).toBe(-300_000);
    expect(p.netMargin).toBeNull();
  });
});

describe("debt aging", () => {
  it("counts days past the due date", () => {
    expect(daysOverdue("2026-11-01", "2026-11-10")).toBe(9);
    expect(daysOverdue("2026-11-20", "2026-11-10")).toBe(-10);
    expect(daysOverdue(null, "2026-11-10")).toBe(0);
  });

  it("buckets by days overdue", () => {
    const today = "2026-11-10";
    expect(agingBucket(null, today)).toBe("current");
    expect(agingBucket("2026-11-10", today)).toBe("current");
    expect(agingBucket("2026-11-09", today)).toBe("d1_30");
    expect(agingBucket("2026-10-11", today)).toBe("d1_30");
    expect(agingBucket("2026-10-10", today)).toBe("d31_60");
    expect(agingBucket("2026-08-12", today)).toBe("d61_90");
    expect(agingBucket("2026-08-11", today)).toBe("d90_plus");
  });
});

describe("validators", () => {
  it("rejects a transfer to the same fund and non-positive amounts", () => {
    expect(transferSchema.safeParse({ fromFundId: 1, toFundId: 1, amount: 10 }).success).toBe(
      false,
    );
    expect(transferSchema.safeParse({ fromFundId: 1, toFundId: 2, amount: 0 }).success).toBe(false);
    expect(transferSchema.safeParse({ fromFundId: 1, toFundId: 2, amount: 10 }).success).toBe(true);
  });

  it("needs a positive amount and a valid date on records", () => {
    const base = { type: "expense", categoryId: 1, amount: 100_000 };
    expect(createRecordSchema.safeParse(base).success).toBe(true);
    expect(createRecordSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
    expect(createRecordSchema.safeParse({ ...base, date: "10/11/2026" }).success).toBe(false);
    expect(createRecordSchema.safeParse({ ...base, type: "transfer" }).success).toBe(false);
  });

  it("checks fund codes and ledger ranges", () => {
    expect(createFundSchema.safeParse({ name: "Két", code: "QUY 1" }).success).toBe(false);
    expect(createFundSchema.parse({ name: "Két" })).toMatchObject({
      type: "cash",
      openingBalance: 0,
    });
    expect(
      fundLedgerSchema.safeParse({ fundId: 1, from: "2026-11-10", to: "2026-11-01" }).success,
    ).toBe(false);
  });
});

describe("accounting permissions", () => {
  const user = (roles: string[]): AuthUser => ({
    id: "u",
    username: "u",
    tenantId: "t",
    roles,
    resourceRoles: {},
    expiresAt: 0,
  });

  it("admin and manager can use accounting, seller and warehouse cannot", () => {
    for (const p of [
      "accounting:read",
      "accounting:fund",
      "accounting:revenue_expense",
      "accounting:debt",
    ] as const) {
      expect(hasPermission(user(["bizone-admin"]), p)).toBe(true);
      expect(hasPermission(user(["bizone-manager"]), p)).toBe(true);
      expect(hasPermission(user(["bizone-seller"]), p)).toBe(false);
      expect(hasPermission(user(["bizone-warehouse"]), p)).toBe(false);
    }
  });

  it("catalog entries now grant the accounting capabilities", () => {
    expect(
      [
        ...capabilitiesOf([
          "accounting.read",
          "accounting.manage_fund",
          "accounting.manage_revenue_expense",
          "accounting.manage_debt",
        ]),
      ].sort(),
    ).toEqual([
      "accounting:debt",
      "accounting:fund",
      "accounting:read",
      "accounting:revenue_expense",
    ]);
  });
});
