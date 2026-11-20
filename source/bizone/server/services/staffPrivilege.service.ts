import { bizoneError } from "@/lib/errors";
import * as kc from "@/lib/keycloak-admin";
import { capabilitiesOf, SYSTEM_ROLES } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { roleCapabilities } from "@/lib/rbac";
import {
  grantRefusal,
  manageRefusal,
  roleEditRefusal,
  type Privileges,
  type RoleInfo,
} from "@/lib/staff/privilege";
import { currentTenantId } from "@/lib/tenant";
import { getStaffAccess } from "@/server/services/rbac.service";
import type { AuthUser, Permission } from "@/types/auth";

/** P6.6 (#98) — data side of lib/staff/privilege.ts (rules there). Runs inside the tenant. */

export async function actorPrivileges(user: AuthUser): Promise<Privileges> {
  const tokenCaps = user.roles.flatMap((r) => roleCapabilities(r));
  const access = await getStaffAccess(user);
  return {
    isAdmin: tokenCaps.includes("admin:*"),
    capabilities: new Set<Permission>([...tokenCaps, ...access.capabilities]),
  };
}

const roleSelect = {
  id: true,
  code: true,
  name: true,
  isSystem: true,
  rolePermissions: { select: { permission: { select: { code: true } } } },
} as const;

function toInfo(r: {
  code: string;
  name: string;
  isSystem: boolean | null;
  rolePermissions: { permission: { code: string } }[];
}): RoleInfo {
  const isSystem = r.isSystem === true;
  return {
    code: r.code,
    name: r.name,
    isSystem,
    // a system role grants what its Keycloak realm role grants; a custom one its catalog codes
    capabilities: isSystem
      ? new Set(roleCapabilities(`bizone-${r.code}`))
      : capabilitiesOf(r.rolePermissions.map((rp) => rp.permission.code)),
  };
}

async function rolesById(ids: number[]): Promise<RoleInfo[]> {
  if (ids.length === 0) return [];
  const rows = await getPrisma().role.findMany({ where: { id: { in: ids } }, select: roleSelect });
  return rows.map(toInfo);
}

/**
 * Everything a staff member holds: roles assigned in the Staff module (`user_roles`) **and** the
 * `bizone-*` realm roles of their Keycloak account — an owner / admin created in Keycloak (or by
 * the realm import) has no `user_roles` row, yet their tokens carry `bizone-admin`. Keycloak
 * unreachable → the call fails (closed), never "no roles".
 */
async function rolesOfStaff(userId: number): Promise<RoleInfo[]> {
  const prisma = getPrisma();
  const [rows, user] = await Promise.all([
    prisma.userRole.findMany({ where: { userId }, select: { role: { select: roleSelect } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  const roles = rows.map((r) => toInfo(r.role));
  if (!user) return roles;
  const account = await kc.findUserByUsername(user.username).catch(kc.mapKeycloakError);
  if (!account) return roles;
  kc.assertTenant(account, currentTenantId());
  const realmRoles = await kc.effectiveRealmRolesOf(account.id).catch(kc.mapKeycloakError);
  for (const name of realmRoles.filter((r) => r.startsWith("bizone-"))) {
    const code = name.slice("bizone-".length);
    roles.push({
      code,
      name: SYSTEM_ROLES.find((r) => r.code === code)?.name ?? name,
      isSystem: true,
      capabilities: new Set(roleCapabilities(name)),
    });
  }
  return roles;
}

const deny = (reason: string | null) => {
  if (reason) throw bizoneError("FORBIDDEN", reason);
};

/** Before giving these roles to anyone (create staff, set roles). */
export async function assertCanGrantRoles(user: AuthUser, roleIds: number[]): Promise<void> {
  const actor = await actorPrivileges(user);
  if (actor.isAdmin) return;
  for (const role of await rolesById([...new Set(roleIds)])) deny(grantRefusal(actor, role));
}

/** Before editing / locking / resetting the password / changing the roles of a staff member. */
export async function assertCanManageStaff(user: AuthUser, targetId: number): Promise<void> {
  const actor = await actorPrivileges(user);
  if (actor.isAdmin) return;
  deny(manageRefusal(actor, await rolesOfStaff(targetId)));
}

/** Before creating / editing (old and new permission set) / deleting a custom role. */
export async function assertCanEditRole(
  user: AuthUser,
  opts: { roleId?: number; permissionCodes?: string[] },
): Promise<void> {
  const actor = await actorPrivileges(user);
  if (actor.isAdmin) return;
  if (opts.permissionCodes) deny(roleEditRefusal(actor, capabilitiesOf(opts.permissionCodes)));
  if (opts.roleId) {
    const [current] = await rolesById([opts.roleId]);
    if (current) deny(roleEditRefusal(actor, current.capabilities));
  }
}
