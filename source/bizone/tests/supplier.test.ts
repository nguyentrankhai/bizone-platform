import { describe, expect, it } from "vitest";
import {
  addDays,
  allocatePayment,
  debtStatus,
  isOverdue,
  lineTotal,
  paymentTermDays,
  poTotals,
  receivedDebtAmount,
} from "@/lib/supplier/calc";
import { createPoSchema, createSupplierSchema, receivePoSchema } from "@/lib/validators/supplier";
import { capabilitiesOf } from "@/lib/permissions";
import { hasPermission } from "@/lib/rbac";
import type { AuthUser } from "@/types/auth";

const lines = [
  { quantity: 10, unitCost: 100_000, discountPercent: 5 },
  { quantity: 5, unitCost: 50_000 },
  { quantity: 4, unitCost: 85_000 },
];

describe("purchase order totals", () => {
  it("applies line discount, order discount and tax", () => {
    expect(lineTotal(10, 100_000, 5)).toBe(950_000);
    expect(poTotals(lines, 10_000, 8_000)).toEqual({
      subtotal: 1_540_000,
      discountAmount: 10_000,
      taxAmount: 8_000,
      totalAmount: 1_538_000,
    });
  });

  it("rejects an order discount above the subtotal", () => {
    expect(() => poTotals([{ quantity: 1, unitCost: 1000 }], 5000)).toThrow(RangeError);
  });

  it("rounds odd discounts to cents", () => {
    expect(lineTotal(3, 33_333, 7.5)).toBe(92_499.08);
  });
});

describe("supplier debt from received goods", () => {
  const totals = { subtotal: 1_540_000, totalAmount: 1_538_000 };
  it("prorates order discount and tax by received value", () => {
    const received = [
      { ...lines[0], receivedQuantity: 6 },
      { ...lines[1], receivedQuantity: 0 },
      { ...lines[2], receivedQuantity: 4 },
    ];
    // (6×95.000 + 4×85.000) / 1.540.000 × 1.538.000
    expect(receivedDebtAmount(received, totals)).toBe(908_818.18);
  });
  it("is exactly the PO total once everything arrived", () => {
    expect(
      receivedDebtAmount(
        lines.map((l) => ({ ...l, receivedQuantity: l.quantity })),
        totals,
      ),
    ).toBe(1_538_000);
  });
  it("is 0 before anything arrived", () => {
    expect(
      receivedDebtAmount(
        lines.map((l) => ({ ...l, receivedQuantity: 0 })),
        totals,
      ),
    ).toBe(0);
  });
});

describe("payment terms, due dates, status", () => {
  it("reads the number of days from free text", () => {
    expect(paymentTermDays("Thanh toán trong 30 ngày")).toBe(30);
    expect(paymentTermDays("Net 45 days")).toBe(45);
    expect(paymentTermDays("15")).toBe(15);
    expect(paymentTermDays("Trả ngay khi nhận hàng")).toBeNull();
    expect(paymentTermDays(null)).toBeNull();
  });
  it("adds days across month / year ends", () => {
    expect(addDays("2026-11-10", 30)).toBe("2026-12-10");
    expect(addDays("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDays("2028-02-15", 15)).toBe("2028-03-01"); // leap year
  });
  it("derives debt status and overdue", () => {
    expect(debtStatus(1000, 0)).toBe("pending");
    expect(debtStatus(1000, 400)).toBe("partial");
    expect(debtStatus(1000, 1000)).toBe("paid");
    expect(isOverdue("2026-11-09", 100, "2026-11-10")).toBe(true);
    expect(isOverdue("2026-11-10", 100, "2026-11-10")).toBe(false); // due today is not late
    expect(isOverdue("2026-11-01", 0, "2026-11-10")).toBe(false);
    expect(isOverdue(null, 100, "2026-11-10")).toBe(false);
  });
});

describe("payment allocation (oldest debt first)", () => {
  const debts = [
    { id: 1, remaining: 300_000 },
    { id: 2, remaining: 500_000 },
    { id: 3, remaining: 200_000 },
  ];
  it("fills debts in order", () => {
    expect(allocatePayment(650_000, debts)).toEqual([
      { debtId: 1, amount: 300_000 },
      { debtId: 2, amount: 350_000 },
    ]);
  });
  it("can pay everything exactly", () => {
    expect(allocatePayment(1_000_000, debts)).toHaveLength(3);
  });
  it("refuses to pay more than owed (no credit balance)", () => {
    expect(() => allocatePayment(1_000_000.01, debts)).toThrow(RangeError);
  });
});

describe("validators", () => {
  it("checks VN tax codes", () => {
    expect(createSupplierSchema.safeParse({ name: "A", taxCode: "0312345678" }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: "A", taxCode: "0312345678-001" }).success).toBe(
      true,
    );
    expect(createSupplierSchema.safeParse({ name: "A", taxCode: "12345" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ name: "A", taxCode: "" }).success).toBe(true);
  });
  it("rejects duplicate products in one PO", () => {
    const r = createPoSchema.safeParse({
      supplierId: 1,
      warehouseId: 1,
      items: [
        { productId: 1, quantity: 1, unitCost: 1 },
        { productId: 1, quantity: 2, unitCost: 1 },
      ],
    });
    expect(r.success).toBe(false);
    const variants = createPoSchema.safeParse({
      supplierId: 1,
      warehouseId: 1,
      items: [
        { productId: 1, variantId: 5, quantity: 1, unitCost: 1 },
        { productId: 1, variantId: 6, quantity: 1, unitCost: 1 },
      ],
    });
    expect(variants.success).toBe(true);
  });
  it("needs at least one received quantity", () => {
    expect(receivePoSchema.safeParse({ id: 1, items: [{ itemId: 1, quantity: 0 }] }).success).toBe(
      false,
    );
    expect(receivePoSchema.safeParse({ id: 1, items: [{ itemId: 1, quantity: 2 }] }).success).toBe(
      true,
    );
  });
});

describe("supplier permissions", () => {
  const user = (roles: string[]): AuthUser => ({
    id: "u",
    username: "u",
    tenantId: "t",
    roles,
    resourceRoles: {},
    expiresAt: 0,
  });
  it("manager manages suppliers and POs; warehouse only reads; seller nothing", () => {
    expect(hasPermission(user(["bizone-manager"]), "supplier:manage_po")).toBe(true);
    expect(hasPermission(user(["bizone-warehouse"]), "supplier:read")).toBe(true);
    expect(hasPermission(user(["bizone-warehouse"]), "supplier:manage_po")).toBe(false);
    expect(hasPermission(user(["bizone-seller"]), "supplier:read")).toBe(false);
  });
  it("catalog permissions unlock supplier capabilities for custom roles", () => {
    expect([...capabilitiesOf(["supplier.read", "supplier.manage_po"])].sort()).toEqual([
      "supplier:manage_po",
      "supplier:read",
    ]);
    expect(capabilitiesOf(["supplier.create"]).has("supplier:write")).toBe(true);
  });
});
