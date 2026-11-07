import { Prisma } from "@/generated/prisma/client";
import { bizoneError, notFound } from "@/lib/errors";
import * as kc from "@/lib/keycloak-admin";
import {
  MODULE_LABELS,
  PERMISSION_CATALOG,
  keycloakRoleOf,
  permissionCode,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import type { CreateStaffInput, ListStaffInput, UpdateStaffInput } from "@/lib/validators/staff";
import { invalidateStaffAccess } from "./rbac.service";
import { resolveDbUserId } from "./user.service";
import type { AuthUser } from "@/types/auth";

/**
 * Staff = local `users` profile (tenant DB) + Keycloak account (credentials, realm roles).
 * Role assignments live in `user_roles` (per branch). System roles are mirrored to the
 * Keycloak realm roles `bizone-*` so the access token carries them; custom roles stay in
 * the DB and are applied by rbac.service on each permission check.
 */

type RoleAssignment = { roleId: number; branchId: number };

const staffSelect = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: {
    select: {
      role: { select: { id: true, code: true, name: true, isSystem: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  },
  userBranches: { select: { branchId: true, isDefault: true } },
} satisfies Prisma.UserSelect;

export async function listStaff(input: ListStaffInput) {
  const prisma = getPrisma();
  const where: Prisma.UserWhereInput = {
    ...(input.status ? { isActive: input.status === "active" } : {}),
    ...(input.roleId ? { userRoles: { some: { roleId: input.roleId } } } : {}),
    ...(input.search
      ? {
          OR: [
            { fullName: { contains: input.search } },
            { username: { contains: input.search } },
            { phone: { contains: input.search } },
            { email: { contains: input.search } },
          ],
        }
      : {}),
  };
  const { page, pageSize } = input;
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: staffSelect,
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getStaff(id: number) {
  const user = await getPrisma().user.findUnique({ where: { id }, select: staffSelect });
  if (!user) throw notFound("Nhân viên", id);
  // Keycloak view is informative only — the page still works when Keycloak is down
  let keycloak: { enabled: boolean; realmRoles: string[] } | null = null;
  try {
    const account = await kc.findUserByUsername(user.username);
    if (account && kc.tenantOf(account) === currentTenantId()) {
      keycloak = {
        enabled: account.enabled,
        realmRoles: (await kc.realmRolesOf(account.id)).filter((r) => r.startsWith("bizone-")),
      };
    }
  } catch {
    keycloak = null;
  }
  return { ...user, keycloak };
}

async function validateAssignments(assignments: RoleAssignment[]) {
  const prisma = getPrisma();
  const roleIds = [...new Set(assignments.map((a) => a.roleId))];
  const branchIds = [...new Set(assignments.map((a) => a.branchId))];
  const [roles, branches] = await Promise.all([
    prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true } }),
    prisma.branch.findMany({
      where: { id: { in: branchIds }, status: "active" },
      select: { id: true },
    }),
  ]);
  if (roles.length !== roleIds.length)
    throw bizoneError("VALIDATION_ERROR", "Vai trò không tồn tại");
  if (branches.length !== branchIds.length) {
    throw bizoneError("VALIDATION_ERROR", "Chi nhánh không tồn tại hoặc đã ngừng hoạt động");
  }
  const unique = new Map(assignments.map((a) => [`${a.roleId}:${a.branchId}`, a]));
  const realmRoles = [
    ...new Set(roles.map((r) => keycloakRoleOf(r.code)).filter((r): r is string => !!r)),
  ];
  return { assignments: [...unique.values()], branchIds, realmRoles };
}

async function tenantAccount(username: string): Promise<kc.KcUser | null> {
  const account = await kc.findUserByUsername(username).catch(kc.mapKeycloakError);
  if (account) kc.assertTenant(account, currentTenantId());
  return account;
}

export async function createStaff(input: CreateStaffInput) {
  const prisma = getPrisma();
  const tenantId = currentTenantId();
  const { assignments, branchIds, realmRoles } = await validateAssignments(input.roles);

  const dup = await prisma.user.findFirst({
    where: {
      OR: [{ username: input.username }, ...(input.email ? [{ email: input.email }] : [])],
    },
    select: { username: true },
  });
  if (dup) {
    throw bizoneError(
      "CONFLICT",
      dup.username === input.username
        ? `Tên đăng nhập "${input.username}" đã có hồ sơ nhân viên`
        : `Email "${input.email}" đã được dùng cho nhân viên khác`,
    );
  }

  // 1. Keycloak account (fails fast if the identity provider is unreachable)
  const existing = await kc.findUserByUsername(input.username).catch(kc.mapKeycloakError);
  if (existing) {
    throw bizoneError(
      "CONFLICT",
      kc.tenantOf(existing) === tenantId
        ? `Tài khoản "${input.username}" đã có trên Keycloak — dùng tên đăng nhập khác`
        : `Tên đăng nhập "${input.username}" đã được sử dụng`,
    );
  }
  const kcId = await kc
    .createUser({
      username: input.username,
      email: input.email,
      fullName: input.fullName,
      tenantId,
      branchIds,
      password: input.password,
      temporaryPassword: input.temporaryPassword,
    })
    .catch(kc.mapKeycloakError);

  // 2. Local profile + roles; undo the Keycloak account if anything fails
  try {
    await kc.syncBizoneRealmRoles(kcId, realmRoles);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          passwordHash: "!keycloak",
        },
        select: { id: true },
      });
      await tx.userRole.createMany({
        data: assignments.map((a) => ({ userId: created.id, ...a })),
      });
      await tx.userBranch.createMany({
        data: branchIds.map((branchId, i) => ({
          userId: created.id,
          branchId,
          isDefault: i === 0,
        })),
      });
      return created;
    });
    await invalidateStaffAccess();
    return getStaff(user.id);
  } catch (err) {
    await kc.deleteUser(kcId).catch(() => undefined);
    if (err instanceof kc.KeycloakAdminError) kc.mapKeycloakError(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw bizoneError("CONFLICT", "Tên đăng nhập hoặc email đã tồn tại");
    }
    throw err;
  }
}

export async function updateStaff(input: UpdateStaffInput) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: input.id } });
  if (!user) throw notFound("Nhân viên", input.id);
  if (input.email) {
    const dup = await prisma.user.findFirst({
      where: { email: input.email, id: { not: input.id } },
      select: { id: true },
    });
    if (dup)
      throw bizoneError("CONFLICT", `Email "${input.email}" đã được dùng cho nhân viên khác`);
  }
  const account = await tenantAccount(user.username);
  if (account && (input.fullName !== undefined || input.email !== undefined)) {
    await kc
      .updateUser(account, { fullName: input.fullName, email: input.email })
      .catch(kc.mapKeycloakError);
  }
  await prisma.user.update({
    where: { id: input.id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
  return getStaff(input.id);
}

export async function setStaffRoles(id: number, roles: RoleAssignment[]) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (!user) throw notFound("Nhân viên", id);
  const { assignments, branchIds, realmRoles } = await validateAssignments(roles);
  const old = await prisma.userRole.findMany({
    where: { userId: id },
    select: { roleId: true, branchId: true },
  });

  const account = await tenantAccount(user.username);
  if (account) {
    await kc.syncBizoneRealmRoles(account.id, realmRoles).catch(kc.mapKeycloakError);
    await kc
      .updateUser(account, { attributes: { branch_ids: [JSON.stringify(branchIds)] } })
      .catch(kc.mapKeycloakError);
  }
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userRole.createMany({ data: assignments.map((a) => ({ userId: id, ...a })) }),
    prisma.userBranch.deleteMany({ where: { userId: id, branchId: { notIn: branchIds } } }),
    prisma.userBranch.createMany({
      data: branchIds.map((branchId) => ({ userId: id, branchId })),
      skipDuplicates: true,
    }),
  ]);
  await invalidateStaffAccess();
  return { id, oldRoles: old, roles: assignments, keycloakSynced: Boolean(account) };
}

export async function setStaffActive(id: number, active: boolean, actor: AuthUser) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (!user) throw notFound("Nhân viên", id);
  if (!active && (await resolveDbUserId(actor)) === id) {
    throw bizoneError("CONFLICT", "Không thể tự vô hiệu hoá tài khoản của mình");
  }
  const account = await tenantAccount(user.username);
  if (account) await kc.updateUser(account, { enabled: active }).catch(kc.mapKeycloakError);
  await prisma.user.update({ where: { id }, data: { isActive: active } });
  await invalidateStaffAccess();
  return { id, isActive: active, keycloakSynced: Boolean(account) };
}

export async function resetStaffPassword(id: number, password: string, temporary: boolean) {
  const user = await getPrisma().user.findUnique({ where: { id }, select: { username: true } });
  if (!user) throw notFound("Nhân viên", id);
  const account = await tenantAccount(user.username);
  if (!account) throw bizoneError("NOT_FOUND", "Nhân viên chưa có tài khoản Keycloak");
  await kc.resetPassword(account.id, password, temporary).catch(kc.mapKeycloakError);
  return { id };
}

// ─── Roles & permissions ──────────────────────────────────────────────────────

export function permissionCatalog() {
  const groups = new Map<string, { code: string; name: string; active: boolean }[]>();
  for (const p of PERMISSION_CATALOG) {
    const list = groups.get(p.module) ?? [];
    list.push({ code: permissionCode(p), name: p.name, active: p.grants !== null });
    groups.set(p.module, list);
  }
  return [...groups.entries()].map(([module, permissions]) => ({
    module,
    label: MODULE_LABELS[module] ?? module,
    permissions,
  }));
}

export async function listRoles() {
  const roles = await getPrisma().role.findMany({
    orderBy: [{ isSystem: "desc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      rolePermissions: { select: { permission: { select: { code: true } } } },
      userRoles: { select: { userId: true } },
    },
  });
  return roles.map(({ rolePermissions, userRoles, ...r }) => ({
    ...r,
    permissions: rolePermissions.map((rp) => rp.permission.code),
    userCount: new Set(userRoles.map((u) => u.userId)).size,
  }));
}

async function permissionIds(codes: string[]): Promise<number[]> {
  const unique = [...new Set(codes)];
  const rows = await getPrisma().permission.findMany({
    where: { code: { in: unique } },
    select: { id: true },
  });
  if (rows.length !== unique.length) {
    throw bizoneError(
      "VALIDATION_ERROR",
      "Có quyền không tồn tại — chạy lại db:seed để cập nhật danh mục quyền",
    );
  }
  return rows.map((r) => r.id);
}

function slugCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  return `custom_${base || "role"}_${Date.now().toString(36)}`;
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissions: string[];
}) {
  const prisma = getPrisma();
  const ids = await permissionIds(input.permissions);
  const role = await prisma.role.create({
    data: {
      code: slugCode(input.name),
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      rolePermissions: { create: ids.map((permissionId) => ({ permissionId })) },
    },
    select: { id: true, code: true },
  });
  await invalidateStaffAccess();
  return role;
}

async function customRole(id: number) {
  const role = await getPrisma().role.findUnique({
    where: { id },
    select: { id: true, isSystem: true },
  });
  if (!role) throw notFound("Vai trò", id);
  if (role.isSystem) {
    throw bizoneError("CONFLICT", "Vai trò hệ thống không sửa/xoá được — tạo vai trò tuỳ chỉnh");
  }
  return role;
}

export async function updateRole(input: {
  id: number;
  name: string;
  description?: string;
  permissions: string[];
}) {
  const prisma = getPrisma();
  await customRole(input.id);
  const ids = await permissionIds(input.permissions);
  await prisma.$transaction([
    prisma.role.update({
      where: { id: input.id },
      data: { name: input.name, description: input.description ?? null },
    }),
    prisma.rolePermission.deleteMany({ where: { roleId: input.id } }),
    prisma.rolePermission.createMany({
      data: ids.map((permissionId) => ({ roleId: input.id, permissionId })),
    }),
  ]);
  await invalidateStaffAccess();
  return { id: input.id };
}

export async function deleteRole(id: number) {
  const prisma = getPrisma();
  await customRole(id);
  const inUse = await prisma.userRole.count({ where: { roleId: id } });
  if (inUse > 0) {
    throw bizoneError(
      "CONFLICT",
      `Vai trò đang gán cho ${inUse} nhân viên — gỡ khỏi nhân viên trước`,
    );
  }
  await prisma.role.delete({ where: { id } });
  await invalidateStaffAccess();
  return { id };
}
