import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import {
  BRANCH_CONFIG_KEYS,
  type BranchConfigKey,
  type CreateBranchInput,
  type SetBranchConfigInput,
  type UpdateBranchInput,
} from "@/lib/validators/branch";
import { invalidateBranchCache, type BranchScope } from "@/server/middleware/branchScope";
import { invalidateStaffAccess } from "./rbac.service";

/**
 * Chi nhánh (P4.6, SRS-CONFIG-03): CRUD, chi nhánh mặc định, ngừng hoạt động, cấu hình riêng
 * (`branch_configs` ghi đè `store_config`).
 */

function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function afterChange() {
  await invalidateBranchCache();
  await invalidateStaffAccess();
}

/** Branches for the sidebar switcher: the ones this user may open */
export async function myBranches(scope: BranchScope) {
  const rows = await getPrisma().branch.findMany({
    where: { id: { in: scope.allowed } },
    select: { id: true, code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return { branches: rows, current: scope.current, canAll: scope.canAll };
}

export async function listBranches(includeInactive = true) {
  const prisma = getPrisma();
  const rows = await prisma.branch.findMany({
    where: includeInactive ? {} : { status: "active" },
    orderBy: [{ isDefault: "desc" }, { status: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { warehouses: true, userBranches: true, invoices: true } },
      cashSessions: { where: { status: "open" }, select: { id: true } },
    },
  });
  return rows.map(({ cashSessions, _count, ...b }) => ({
    ...b,
    warehouseCount: _count.warehouses,
    staffCount: _count.userBranches,
    invoiceCount: _count.invoices,
    openSessions: cashSessions.length,
  }));
}

export async function getBranch(id: number) {
  const b = await getPrisma().branch.findUnique({
    where: { id },
    include: {
      warehouses: { select: { id: true, code: true, name: true, isActive: true } },
      userBranches: {
        select: { isDefault: true, user: { select: { id: true, fullName: true, username: true } } },
      },
    },
  });
  if (!b) throw bizoneError("NOT_FOUND", `Chi nhánh #${id} không tồn tại`);
  return { ...b, config: await branchConfig(id) };
}

export async function createBranch(input: CreateBranchInput) {
  const prisma = getPrisma();
  const { isDefault, createWarehouse, ...fields } = input;
  const first = (await prisma.branch.count()) === 0;
  try {
    const branch = await prisma.$transaction(async (tx) => {
      if (isDefault || first) await tx.branch.updateMany({ data: { isDefault: false } });
      const b = await tx.branch.create({ data: { ...fields, isDefault: isDefault || first } });
      if (createWarehouse) {
        await tx.warehouse.create({
          data: {
            branchId: b.id,
            code: `KHO-${b.code}`.slice(0, 50),
            name: `Kho ${b.name}`.slice(0, 255),
            address: b.address,
          },
        });
      }
      return b;
    });
    await afterChange();
    return getBranch(branch.id);
  } catch (e) {
    if (isUniqueViolation(e))
      throw bizoneError(
        "CONFLICT",
        `Mã chi nhánh "${input.code}" hoặc mã kho KHO-${input.code} đã tồn tại`,
      );
    throw e;
  }
}

export async function updateBranch(input: UpdateBranchInput) {
  await getBranch(input.id);
  try {
    await getPrisma().branch.update({ where: { id: input.id }, data: input.data });
  } catch (e) {
    if (isUniqueViolation(e))
      throw bizoneError("CONFLICT", `Mã chi nhánh "${input.data.code}" đã tồn tại`);
    throw e;
  }
  await afterChange();
  return getBranch(input.id);
}

/** Ngừng / mở lại chi nhánh — không ngừng chi nhánh mặc định hoặc đang có ca POS mở */
export async function setBranchStatus(id: number, status: "active" | "inactive") {
  const prisma = getPrisma();
  const b = await getBranch(id);
  if (status === "inactive") {
    if (b.isDefault)
      throw bizoneError(
        "CONFLICT",
        "Không thể ngừng chi nhánh mặc định — chọn chi nhánh mặc định khác trước",
      );
    const open = await prisma.cashSession.count({ where: { branchId: id, status: "open" } });
    if (open) throw bizoneError("CONFLICT", `Chi nhánh đang có ${open} ca POS chưa khoá`);
  }
  await prisma.branch.update({ where: { id }, data: { status } });
  await afterChange();
  return getBranch(id);
}

export async function setDefaultBranch(id: number) {
  const b = await getBranch(id);
  if (b.status !== "active") throw bizoneError("CONFLICT", "Chi nhánh đang ngừng hoạt động");
  await getPrisma().$transaction([
    getPrisma().branch.updateMany({ where: { id: { not: id } }, data: { isDefault: false } }),
    getPrisma().branch.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await afterChange();
  return getBranch(id);
}

/** Xoá chỉ khi chi nhánh chưa phát sinh dữ liệu (ngược lại dùng "Ngừng hoạt động") */
export async function deleteBranch(id: number) {
  const prisma = getPrisma();
  const b = await getBranch(id);
  if (b.isDefault) throw bizoneError("CONFLICT", "Không thể xoá chi nhánh mặc định");
  const whIds = b.warehouses.map((w) => w.id);
  const [sessions, invoices, orders, pos, preorders, stock, notes] = await Promise.all([
    prisma.cashSession.count({ where: { branchId: id } }),
    prisma.invoice.count({ where: { branchId: id } }),
    prisma.order.count({ where: { branchId: id } }),
    prisma.purchaseOrder.count({
      where: { OR: [{ branchId: id }, { warehouseId: { in: whIds } }] },
    }),
    prisma.preorder.count({ where: { branchId: id } }),
    prisma.inventory.count({ where: { warehouseId: { in: whIds }, quantity: { not: 0 } } }),
    prisma.inventoryTransaction.count({
      where: { OR: [{ warehouseId: { in: whIds } }, { destinationWarehouseId: { in: whIds } }] },
    }),
  ]);
  if (sessions + invoices + orders + pos + preorders + stock + notes > 0)
    throw bizoneError(
      "CONFLICT",
      "Chi nhánh đã phát sinh giao dịch (ca, hoá đơn, đơn hàng, phiếu kho…) — chỉ có thể ngừng hoạt động",
    );
  await prisma.$transaction([
    prisma.inventory.deleteMany({ where: { warehouseId: { in: whIds } } }),
    prisma.warehouse.deleteMany({ where: { id: { in: whIds } } }),
    prisma.branch.delete({ where: { id } }),
  ]);
  await afterChange();
  return { id, deleted: true };
}

// ─── Per-branch configuration ─────────────────────────────────────────────────

/** Each key: branch value, store-wide value, and the effective one */
export async function branchConfig(branchId: number) {
  const prisma = getPrisma();
  const keys = [...BRANCH_CONFIG_KEYS];
  const [own, store] = await Promise.all([
    prisma.branchConfig.findMany({ where: { branchId, configKey: { in: keys } } }),
    prisma.storeConfig.findMany({ where: { configKey: { in: keys } } }),
  ]);
  return Object.fromEntries(
    keys.map((k) => {
      const value = own.find((o) => o.configKey === k)?.configValue ?? null;
      const inherited = store.find((o) => o.configKey === k)?.configValue ?? null;
      return [k, { value, inherited, effective: value || inherited || "" }];
    }),
  ) as Record<
    BranchConfigKey,
    { value: string | null; inherited: string | null; effective: string }
  >;
}

export async function setBranchConfig(input: SetBranchConfigInput) {
  const prisma = getPrisma();
  await getBranch(input.branchId);
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [key, raw] of Object.entries(input.values)) {
    const value = raw?.trim() || null;
    const where = { branchId_configKey: { branchId: input.branchId, configKey: key } };
    ops.push(
      value
        ? prisma.branchConfig.upsert({
            where,
            create: { branchId: input.branchId, configKey: key, configValue: value },
            update: { configValue: value },
          })
        : prisma.branchConfig.deleteMany({ where: { branchId: input.branchId, configKey: key } }),
    );
  }
  await prisma.$transaction(ops);
  return branchConfig(input.branchId);
}

/**
 * Effective config for a branch: branch override → store_config. Used by POS (VietQR account,
 * store name on receipts) and invoice numbering.
 */
export async function effectiveConfig<K extends string>(
  branchId: number | null | undefined,
  keys: K[],
): Promise<Record<K, string>> {
  const prisma = getPrisma();
  const [store, own] = await Promise.all([
    prisma.storeConfig.findMany({ where: { configKey: { in: keys } } }),
    branchId
      ? prisma.branchConfig.findMany({ where: { branchId, configKey: { in: keys } } })
      : Promise.resolve([]),
  ]);
  return Object.fromEntries(
    keys.map((k) => [
      k,
      own.find((o) => o.configKey === k)?.configValue ||
        store.find((s) => s.configKey === k)?.configValue ||
        "",
    ]),
  ) as Record<K, string>;
}
