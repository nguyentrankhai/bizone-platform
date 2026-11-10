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
    "staff:manage_shift",
    "staff:manage_attendance",
    "staff:manage_commission",
    "supplier:read",
    "supplier:write",
    "supplier:manage_po",
    "marketing:coupon",
    "marketing:flash_sale",
    "marketing:promotion",
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
    "staff:manage_shift",
    "staff:manage_attendance",
    "supplier:read",
    "supplier:write",
    "supplier:manage_po",
    "marketing:coupon",
    "marketing:flash_sale",
    "marketing:promotion",
    "config:read",
  ],
  "bizone-warehouse": [
    "product:read",
    "inventory:write",
    "inventory:read",
    "order:read",
    "supplier:read",
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

/** Capabilities a Keycloak realm role grants (empty for unknown roles) */
export function roleCapabilities(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Token roles first; `extra` adds capabilities from custom roles assigned in the Staff module
 * (see server/services/rbac.service.ts).
 */
export function hasPermission(
  user: AuthUser,
  permission: Permission,
  extra?: ReadonlySet<Permission>,
): boolean {
  for (const role of user.roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) continue;
    if (perms.includes("admin:*")) return true;
    if (perms.includes(permission)) return true;
  }
  return extra?.has(permission) ?? false;
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
