import { describe, expect, it } from "vitest";
import { isPosManager, sessionAccess } from "@/lib/pos/access";
import { UNTRUSTED_CLIENT, clientIp } from "@/lib/client-ip";
import { assertBranchOrAll, type BranchScope } from "@/server/middleware/branchScope";
import { assertActorBranch, type PosActor } from "@/server/services/cashSession.service";

const base = {
  allowedBranchIds: [14],
  sessionBranchId: 14,
  sessionUserId: 7,
  userId: 7,
  canManage: false,
  canWrite: true,
};

describe("QA-3 #93 — who may use a cash session", () => {
  it("the cashier who opened the shift may write", () => {
    expect(sessionAccess(base)).toBe("write");
  });

  it("another cashier of the same branch only watches", () => {
    expect(sessionAccess({ ...base, userId: 8 })).toBe("read");
    expect(sessionAccess({ ...base, userId: null })).toBe("read");
  });

  it("a manager of the branch may write on any shift there", () => {
    expect(sessionAccess({ ...base, userId: 8, canManage: true })).toBe("write");
  });

  it("nobody outside the branch scope gets in — managers included", () => {
    expect(sessionAccess({ ...base, sessionBranchId: 15 })).toBe("none");
    expect(sessionAccess({ ...base, sessionBranchId: 15, canManage: true })).toBe("none");
  });

  it("read-only staff never write, even on their own shift", () => {
    expect(sessionAccess({ ...base, canWrite: false })).toBe("read");
    expect(sessionAccess({ ...base, canWrite: false, canManage: true })).toBe("read");
  });

  it("manager roles", () => {
    expect(isPosManager(["bizone-manager"])).toBe(true);
    expect(isPosManager(["bizone-admin", "x"])).toBe(true);
    expect(isPosManager(["bizone-seller"])).toBe(false);
  });
});

describe("QA-3 #95 — POS actions stay in the actor's branches", () => {
  const actor: PosActor = { userId: 1, tenantId: "t", canManage: true, branchIds: [14] };
  it("refuses a record of another branch", () => {
    expect(() => assertActorBranch(actor, 14, "Ca #1")).not.toThrow();
    expect(() => assertActorBranch(actor, 15, "Hóa đơn HD1")).toThrow(/chi nhánh/);
  });
});

describe("QA-3 #96 — store-wide records", () => {
  const branchManager: BranchScope = { current: 14, allowed: [14], canAll: false };
  const admin: BranchScope = { current: null, allowed: [14, 15], canAll: true };
  it("a branch manager changes their branch only, never store-wide shifts", () => {
    expect(() => assertBranchOrAll(branchManager, 14)).not.toThrow();
    expect(() => assertBranchOrAll(branchManager, 15)).toThrow();
    expect(() => assertBranchOrAll(branchManager, null)).toThrow(/quản trị viên/);
  });
  it("an admin may change store-wide shifts", () => {
    expect(() => assertBranchOrAll(admin, null)).not.toThrow();
    expect(() => assertBranchOrAll(admin, 15)).not.toThrow();
  });
});

describe("QA-3 #97 — client IP for rate limits", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("ignores forwarded headers unless a proxy is trusted", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }), false)).toBe(UNTRUSTED_CLIENT);
    expect(clientIp(h({ "x-real-ip": "1.2.3.4" }), false)).toBe(UNTRUSTED_CLIENT);
  });
  it("behind a proxy: X-Real-IP, else the last X-Forwarded-For hop (not the client's)", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }), true)).toBe(
      "9.9.9.9",
    );
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), true)).toBe("203.0.113.7");
    expect(clientIp(h({}), true)).toBe(UNTRUSTED_CLIENT);
  });
});
