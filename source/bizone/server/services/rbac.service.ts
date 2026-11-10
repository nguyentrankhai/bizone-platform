import { getPrisma } from "@/lib/prisma";
import { capabilitiesOf } from "@/lib/permissions";
import { getRedis } from "@/lib/redis";
import { currentTenantId } from "@/lib/tenant";
import type { AuthUser, Permission } from "@/types/auth";

/**
 * Staff-module access data for a token user, read from the tenant DB:
 * - `active`: false when the local staff profile is deactivated (blocks every permission check,
 *   so "nghỉ việc" takes effect before the 15-minute access token expires);
 * - `capabilities`: what the user's custom roles add on top of their Keycloak realm roles.
 *
 * Cached per tenant in one Redis hash (TTL 60 s); any role / staff change drops the hash.
 */
export interface StaffAccess {
  active: boolean;
  capabilities: Set<Permission>;
  /** Branches assigned in the Staff module (user_branches) — P4.6 branch scope */
  branchIds: number[];
  defaultBranchId: number | null;
}

interface CachedAccess {
  active: boolean;
  codes: string[];
  branchIds?: number[];
  defaultBranchId?: number | null;
}

const TTL_SECONDS = 60;

function cacheKey(): string {
  return `rbac:${currentTenantId()}`;
}

async function loadAccess(user: AuthUser): Promise<CachedAccess> {
  const prisma = getPrisma();
  const local = await prisma.user.findFirst({
    where: { OR: [{ username: user.username }, ...(user.email ? [{ email: user.email }] : [])] },
    select: {
      isActive: true,
      userRoles: {
        where: { role: { isSystem: false } },
        select: { role: { select: { rolePermissions: { select: { permission: true } } } } },
      },
      userBranches: { select: { branchId: true, isDefault: true } },
    },
  });
  if (!local) return { active: true, codes: [], branchIds: [], defaultBranchId: null }; // no profile yet: token roles decide
  const codes = local.userRoles.flatMap((ur) =>
    ur.role.rolePermissions.map((rp) => rp.permission.code),
  );
  return {
    active: local.isActive,
    codes: [...new Set(codes)],
    branchIds: local.userBranches.map((b) => b.branchId).sort((a, b) => a - b),
    defaultBranchId: local.userBranches.find((b) => b.isDefault)?.branchId ?? null,
  };
}

export async function getStaffAccess(user: AuthUser): Promise<StaffAccess> {
  const redis = getRedis();
  const key = cacheKey();
  let data: CachedAccess | null = null;
  try {
    const cached = await redis.hget(key, user.username);
    if (cached) data = JSON.parse(cached) as CachedAccess;
    // Entries cached before P4.6 have no branch data → reload
    if (data && !data.branchIds) data = null;
  } catch {
    /* Redis down → read DB */
  }
  if (!data) {
    data = await loadAccess(user);
    try {
      await redis
        .multi()
        .hset(key, user.username, JSON.stringify(data))
        .expire(key, TTL_SECONDS)
        .exec();
    } catch {
      /* cache is best effort */
    }
  }
  return {
    active: data.active,
    capabilities: capabilitiesOf(data.codes),
    branchIds: data.branchIds ?? [],
    defaultBranchId: data.defaultBranchId ?? null,
  };
}

/** Call after any change to roles, role permissions or a staff member's active flag */
export async function invalidateStaffAccess(): Promise<void> {
  await getRedis()
    .del(cacheKey())
    .catch(() => undefined);
}
