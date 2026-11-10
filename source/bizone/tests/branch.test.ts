import { describe, expect, it } from "vitest";
import { computeBranchScope } from "@/server/middleware/branchScope";
import { createBranchSchema, setBranchConfigSchema } from "@/lib/validators/branch";
import { toAscii } from "@/lib/printing/escpos";

const active = [
  { id: 1, isDefault: true },
  { id: 2, isDefault: false },
  { id: 3, isDefault: false },
];
const admin = { roles: ["bizone-admin"] };
const manager = { roles: ["bizone-manager"] };
const seller = { roles: ["bizone-seller"] };
const none = { branchIds: [], defaultBranchId: null };

describe("branch scope (P4.6)", () => {
  it("admin: every branch, 'all' by default, may pick any", () => {
    expect(computeBranchScope(admin, none, null, active)).toEqual({
      current: null,
      allowed: [1, 2, 3],
      canAll: true,
    });
    expect(computeBranchScope(admin, none, "2", active).current).toBe(2);
    expect(computeBranchScope(admin, none, "all", active).current).toBeNull();
  });

  it("assigned staff: only their branches, default first, never 'all'", () => {
    const a = { branchIds: [2, 3], defaultBranchId: 3 };
    expect(computeBranchScope(seller, a, null, active)).toEqual({
      current: 3,
      allowed: [2, 3],
      canAll: false,
    });
    expect(computeBranchScope(seller, a, "2", active).current).toBe(2);
    expect(() => computeBranchScope(seller, a, "1", active)).toThrow(/chi nhánh #1/);
    expect(() => computeBranchScope(seller, a, "all", active)).toThrow(/tất cả/);
    expect(() => computeBranchScope(seller, a, "abc", active)).toThrow(/không hợp lệ/);
  });

  it("manager without assignment sees all; with assignment only those", () => {
    expect(computeBranchScope(manager, none, null, active).canAll).toBe(true);
    const m = computeBranchScope(manager, { branchIds: [2], defaultBranchId: null }, null, active);
    expect(m).toEqual({ current: 2, allowed: [2], canAll: false });
  });

  it("unassigned seller falls back to the default branch; inactive branches drop out", () => {
    expect(computeBranchScope(seller, none, null, active)).toEqual({
      current: 1,
      allowed: [1],
      canAll: false,
    });
    const onlyActive = [{ id: 1, isDefault: true }];
    expect(
      computeBranchScope(seller, { branchIds: [1, 2], defaultBranchId: 2 }, null, onlyActive),
    ).toEqual({ current: 1, allowed: [1], canAll: false });
  });
});

describe("branch validators (P4.6)", () => {
  it("normalises the code and empty optional fields", () => {
    const b = createBranchSchema.parse({ code: "hn-01", name: "Hà Nội", email: "", phone: "" });
    expect(b).toMatchObject({ code: "HN-01", email: null, phone: null, createWarehouse: true });
    expect(createBranchSchema.safeParse({ code: "H N", name: "X Y" }).success).toBe(false);
  });

  it("accepts only known config keys", () => {
    expect(
      setBranchConfigSchema.safeParse({ branchId: 1, values: { bank_bin: "970436" } }).success,
    ).toBe(true);
    expect(setBranchConfigSchema.safeParse({ branchId: 1, values: { secret: "x" } }).success).toBe(
      false,
    );
  });

  it("receipt footer folds to ASCII for ESC/POS", () => {
    expect(toAscii("Cảm ơn — hẹn gặp lại")).toBe("Cam on ? hen gap lai");
  });
});
