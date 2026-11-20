import type { Permission } from "@/types/auth";

/**
 * P6.6 (#98) — no privilege escalation through the Staff module. `staff:write` lets someone
 * manage staff, but not hand out more power than they hold:
 * - only an administrator (realm role with `admin:*`) grants / removes the system roles
 *   `admin` and `manager`, or manages (edit, lock, reset password, change roles of) someone who
 *   holds them;
 * - nobody grants a role carrying a capability they don't have themselves, nor manages a staff
 *   member who has a capability they lack;
 * - a custom role can only be created / edited / deleted with capabilities the editor holds.
 * Pure rules — the data comes from server/services/staffPrivilege.service.ts.
 */

export const PRIVILEGED_SYSTEM_ROLES = ["admin", "manager"] as const;

export interface Privileges {
  isAdmin: boolean;
  capabilities: ReadonlySet<Permission>;
}

export interface RoleInfo {
  name: string;
  code: string;
  isSystem: boolean;
  capabilities: ReadonlySet<Permission>;
}

const isPrivilegedRole = (r: RoleInfo) =>
  r.isSystem && (PRIVILEGED_SYSTEM_ROLES as readonly string[]).includes(r.code);

function missing(actor: Privileges, caps: Iterable<Permission>): Permission[] {
  return [...new Set(caps)].filter((c) => !actor.capabilities.has(c)).sort();
}

/** Why `actor` may not give `role` to someone (`null` = allowed). */
export function grantRefusal(actor: Privileges, role: RoleInfo): string | null {
  if (actor.isAdmin) return null;
  if (isPrivilegedRole(role)) return `Chỉ Quản trị viên được cấp vai trò "${role.name}"`;
  const lack = missing(actor, role.capabilities);
  return lack.length
    ? `Không thể cấp vai trò "${role.name}" có quyền bạn không có: ${lack.join(", ")}`
    : null;
}

/** Why `actor` may not manage a staff member holding `targetRoles` (`null` = allowed). */
export function manageRefusal(actor: Privileges, targetRoles: readonly RoleInfo[]): string | null {
  if (actor.isAdmin) return null;
  const privileged = targetRoles.find(isPrivilegedRole);
  if (privileged)
    return `Chỉ Quản trị viên được thao tác trên nhân viên có vai trò "${privileged.name}"`;
  const lack = missing(
    actor,
    targetRoles.flatMap((r) => [...r.capabilities]),
  );
  return lack.length ? `Nhân viên này có quyền bạn không có: ${lack.join(", ")}` : null;
}

/** Why `actor` may not create / edit / delete a custom role with these capabilities. */
export function roleEditRefusal(
  actor: Privileges,
  capabilities: Iterable<Permission>,
): string | null {
  if (actor.isAdmin) return null;
  const lack = missing(actor, capabilities);
  return lack.length ? `Không thể đặt cho vai trò quyền bạn không có: ${lack.join(", ")}` : null;
}
