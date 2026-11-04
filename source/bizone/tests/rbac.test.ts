import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/rbac";
import type { AuthUser } from "@/types/auth";

const user = (roles: string[]): AuthUser => ({
  id: "u1",
  username: "u",
  tenantId: "tenant_demo",
  roles,
  resourceRoles: {},
  expiresAt: 0,
});

describe("hasPermission", () => {
  it("grants everything to admins", () => {
    expect(hasPermission(user(["bizone-admin"]), "staff:write")).toBe(true);
  });
  it("lets sellers sell but not manage products", () => {
    expect(hasPermission(user(["bizone-seller"]), "pos:write")).toBe(true);
    expect(hasPermission(user(["bizone-seller"]), "product:write")).toBe(false);
  });
  it("keeps viewers read-only", () => {
    expect(hasPermission(user(["bizone-viewer"]), "order:read")).toBe(true);
    expect(hasPermission(user(["bizone-viewer"]), "order:write")).toBe(false);
  });
  it("ignores unknown roles", () => {
    expect(hasPermission(user(["offline_access", "uma_authorization"]), "pos:read")).toBe(false);
  });
});
