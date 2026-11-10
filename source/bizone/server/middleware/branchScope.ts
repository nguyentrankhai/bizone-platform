import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { currentTenantId } from "@/lib/tenant";
import type { AuthUser } from "@/types/auth";
import type { StaffAccess } from "@/server/services/rbac.service";

/**
 * Multi-store branch scope (P4.6).
 *
 * The client sends the branch it works on in `X-Branch-ID` (the sidebar switcher; `all` = every
 * branch). Who may see what:
 * - admins (`admin:*`) and managers without a branch assignment: every active branch, plus "all";
 * - everyone else: the branches assigned in the Staff module (`user_branches`); a user with no
 *   assignment falls back to the default branch only.
 * No header → "all" for users who may, otherwise their default / first branch.
 * Services filter by `scope.current` (null = no branch filter).
 */
export interface BranchScope {
  /** Branch the request works on; null = all branches (only when `canAll`) */
  current: number | null;
  /** Active branches the user may access */
  allowed: number[];
  canAll: boolean;
}

export const BRANCH_HEADER = "x-branch-id";
const CACHE_TTL = 60;
const cacheKey = () => `branches:${currentTenantId()}`;

interface BranchRow {
  id: number;
  isDefault: boolean;
}

/** Active branches of the tenant (cached 60 s, dropped by `invalidateBranchCache`) */
export async function activeBranchRows(): Promise<BranchRow[]> {
  const redis = getRedis();
  try {
    const hit = await redis.get(cacheKey());
    if (hit) return JSON.parse(hit) as BranchRow[];
  } catch {
    /* Redis down → DB */
  }
  const rows = await getPrisma().branch.findMany({
    where: { status: "active" },
    select: { id: true, isDefault: true },
    orderBy: { id: "asc" },
  });
  await redis.setex(cacheKey(), CACHE_TTL, JSON.stringify(rows)).catch(() => undefined);
  return rows;
}

export async function invalidateBranchCache() {
  await getRedis()
    .del(cacheKey())
    .catch(() => undefined);
}

export async function resolveBranchScope(
  user: AuthUser,
  access: Pick<StaffAccess, "branchIds" | "defaultBranchId">,
  header: string | null,
): Promise<BranchScope> {
  return computeBranchScope(user, access, header, await activeBranchRows());
}

/** Pure part of `resolveBranchScope` (unit-tested) */
export function computeBranchScope(
  user: Pick<AuthUser, "roles">,
  access: Pick<StaffAccess, "branchIds" | "defaultBranchId">,
  header: string | null,
  active: BranchRow[],
): BranchScope {
  const activeIds = active.map((b) => b.id);
  const defaultId = active.find((b) => b.isDefault)?.id ?? activeIds[0] ?? null;

  const canAll =
    hasPermission(user as AuthUser, "admin:*") ||
    (user.roles.includes("bizone-manager") && access.branchIds.length === 0);
  let allowed = canAll ? activeIds : access.branchIds.filter((id) => activeIds.includes(id));
  if (!canAll && allowed.length === 0 && defaultId !== null) allowed = [defaultId];

  const raw = header?.trim();
  if (raw && raw !== "all") {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0)
      throw bizoneError("VALIDATION_ERROR", "X-Branch-ID không hợp lệ");
    if (!allowed.includes(id))
      throw bizoneError("FORBIDDEN", `Không có quyền truy cập chi nhánh #${id}`);
    return { current: id, allowed, canAll };
  }
  if (raw === "all" && !canAll)
    throw bizoneError("FORBIDDEN", "Chỉ quản trị viên được xem tất cả chi nhánh");
  if (canAll) return { current: null, allowed, canAll };
  const preferred =
    access.defaultBranchId && allowed.includes(access.defaultBranchId)
      ? access.defaultBranchId
      : (allowed[0] ?? null);
  return { current: preferred, allowed, canAll };
}

// ─── Helpers for routers ──────────────────────────────────────────────────────

/** Branch filter for a list/report: an explicit branch must be allowed; default = current scope */
export function branchFilter(scope: BranchScope, requested?: number | null): number | undefined {
  if (requested) {
    assertBranch(scope, requested);
    return requested;
  }
  return scope.current ?? undefined;
}

/** The user may act on this branch */
export function assertBranch(scope: BranchScope, branchId: number | null | undefined) {
  if (branchId === null || branchId === undefined) return; // not tied to a branch (e.g. online order)
  if (!scope.allowed.includes(branchId))
    throw bizoneError("FORBIDDEN", `Không có quyền truy cập chi nhánh #${branchId}`);
}

/**
 * Warehouses visible in the current scope: those of the current branch (null = no filter when
 * the user works on "all"). Warehouses without a branch belong to the whole store → visible.
 */
export async function scopeWarehouseIds(scope: BranchScope): Promise<number[] | null> {
  if (scope.current === null && scope.canAll) return null;
  const branchIds = scope.current !== null ? [scope.current] : scope.allowed;
  const rows = await getPrisma().warehouse.findMany({
    where: { OR: [{ branchId: { in: branchIds } }, { branchId: null }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The warehouse belongs to a branch the user may access (store-wide warehouses always do) */
export async function assertWarehouse(scope: BranchScope, warehouseId: number) {
  const wh = await getPrisma().warehouse.findUnique({
    where: { id: warehouseId },
    select: { branchId: true },
  });
  if (!wh) throw bizoneError("NOT_FOUND", `Kho #${warehouseId} không tồn tại`);
  assertBranch(scope, wh.branchId);
}

/** Inventory note (incl. transfers): the user may see it from the source or the destination side */
export async function assertInventoryTransaction(scope: BranchScope, id: number) {
  const t = await getPrisma().inventoryTransaction.findUnique({
    where: { id },
    select: {
      warehouse: { select: { branchId: true } },
      destinationWarehouse: { select: { branchId: true } },
    },
  });
  if (!t) throw bizoneError("NOT_FOUND", `Phiếu kho #${id} không tồn tại`);
  const ids = [t.warehouse.branchId, t.destinationWarehouse?.branchId];
  if (ids.some((b) => b === null || (b !== undefined && scope.allowed.includes(b)))) return;
  throw bizoneError("FORBIDDEN", `Phiếu kho #${id} thuộc chi nhánh khác`);
}

export async function assertStockTake(scope: BranchScope, id: number) {
  const n = await getPrisma().stockTakeNote.findUnique({
    where: { id },
    select: { warehouseId: true },
  });
  if (!n) throw bizoneError("NOT_FOUND", `Phiếu kiểm kê #${id} không tồn tại`);
  await assertWarehouse(scope, n.warehouseId);
}
