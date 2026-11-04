import type { AuthUser, Permission } from "@/types/auth";

// Role → permissions mapping (matches BizOne RBAC spec in SRS-BizOne.md §6)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Keycloak realm roles
  "bizone-admin": [
    "admin:*",
    "pos:write",
    "pos:read",
    "product:write",
    "product:read",
    "inventory:write",
    "inventory:read",
    "order:write",
    "order:read",
    "crm:write",
    "crm:read",
    "crm:manage_points",
    "crm:manage_debt",
    "report:read",
    "staff:write",
    "staff:read",
    "staff:view_audit_log",
  ],
  "bizone-manager": [
    "pos:write",
    "pos:read",
    "product:write",
    "product:read",
    "inventory:write",
    "inventory:read",
    "order:write",
    "order:read",
    "crm:write",
    "crm:read",
    "crm:manage_points",
    "crm:manage_debt",
    "report:read",
    "staff:read",
    "staff:view_audit_log",
  ],
  "bizone-seller": [
    "pos:write",
    "pos:read",
    "product:read",
    "inventory:read",
    "order:write",
    "order:read",
    "crm:read",
  ],
  "bizone-viewer": [
    "pos:read",
    "product:read",
    "inventory:read",
    "order:read",
    "crm:read",
    "report:read",
  ],
};

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  for (const role of user.roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) continue;
    if (perms.includes("admin:*")) return true;
    if (perms.includes(permission)) return true;
  }
  return false;
}

export function requirePermission(user: AuthUser, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError(`Required permission: ${permission}`);
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
