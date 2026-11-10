import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { dbDate, vnDateKey } from "@/lib/vn-time";
import {
  SYSTEM_CATEGORY_CODES,
  categoryAccepts,
  directionOf,
  docCode,
  nextSeq,
  opposite,
  round2,
  subtreeIds,
  wouldCycle,
  type RecordType,
} from "@/lib/accounting/calc";
import type {
  CancelRecordInput,
  CreateCategoryInput,
  CreateRecordInput,
  ListRecordsInput,
  UpdateCategoryInput,
  UpdateRecordInput,
} from "@/lib/validators/accounting";
import { assertBranch, type BranchScope } from "@/server/middleware/branchScope";
import { FUND_REFERENCE, assertFund, postMovement } from "./cashFund.service";

/**
 * Sổ thu chi (SRS-ACC-01): danh mục thu chi dạng cây + phiếu thu (PT…) / phiếu chi (PC…).
 *
 * Phiếu có quỹ → ghi biến động quỹ cùng transaction (thu: quỹ tăng, chi: quỹ giảm). Sửa số tiền /
 * quỹ → đảo biến động cũ rồi ghi biến động mới; huỷ phiếu → đảo biến động (phiếu giữ lại với
 * trạng thái `cancelled`, không xoá). Phiếu sinh tự động từ nghiệp vụ khác (thanh toán NCC, thu
 * nợ khách — `reference_type` khác NULL) chỉ xem, không sửa / huỷ ở đây.
 */

type Tx = Prisma.TransactionClient;

const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);
const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const todayKey = () => vnDateKey(new Date());
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** `reference_type` of records created by other modules */
export const RECORD_SOURCE = {
  supplierPayment: "supplier_payment",
  customerDebtPayment: "customer_debt_payment",
} as const;

export const RECORD_SOURCE_LABEL: Record<string, string> = {
  [RECORD_SOURCE.supplierPayment]: "Thanh toán nhà cung cấp",
  [RECORD_SOURCE.customerDebtPayment]: "Khách trả nợ",
};

/** Default definition of system categories (created on demand when the seed has not run) */
const SYSTEM_CATEGORY_DEFAULTS: Record<string, { name: string; type: "revenue" | "expense" }> = {
  revenue_sales: { name: "Doanh thu bán hàng", type: "revenue" },
  revenue_other: { name: "Doanh thu khác", type: "revenue" },
  revenue_debt_collection: { name: "Thu nợ khách hàng", type: "revenue" },
  expense_purchase: { name: "Tiền nhập hàng", type: "expense" },
  expense_other: { name: "Chi phí khác", type: "expense" },
};

/** Categories auto flows post to — must stay active */
const LOCKED_CATEGORY_CODES = ["expense_purchase", "revenue_debt_collection"];

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Retry a transaction that generates a document code when a concurrent one took it */
async function withCodeRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4 || !isUniqueViolation(e)) throw e;
    }
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

async function allCategories(db: Tx | ReturnType<typeof getPrisma> = getPrisma()) {
  return db.revenueExpenseCategory.findMany({
    select: { id: true, parentId: true, code: true, name: true, type: true, isActive: true },
  });
}

export async function categoryTree() {
  const prisma = getPrisma();
  const [cats, counts] = await Promise.all([
    prisma.revenueExpenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.revenueExpenseRecord.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
      orderBy: { categoryId: "asc" },
    }),
  ]);
  const used = new Map(
    counts.map((c) => [c.categoryId, typeof c._count === "object" ? (c._count._all ?? 0) : 0]),
  );
  type Node = (typeof cats)[number] & {
    isSystem: boolean;
    recordCount: number;
    children: Node[];
  };
  const nodes = new Map<number, Node>(
    cats.map((c) => [
      c.id,
      {
        ...c,
        isSystem: (SYSTEM_CATEGORY_CODES as readonly string[]).includes(c.code),
        recordCount: used.get(c.id) ?? 0,
        children: [],
      },
    ]),
  );
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

/** "Tiền điện thoại" → "tien_dien_thoai" */
export function slugCode(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "danh_muc"
  );
}

async function uniqueCategoryCode(base: string): Promise<string> {
  const prisma = getPrisma();
  for (let i = 1; ; i++) {
    const code = i === 1 ? base : `${base}_${i}`;
    if (!(await prisma.revenueExpenseCategory.findUnique({ where: { code } }))) return code;
  }
}

function assertChildType(
  parent: { name: string; type: string } | null,
  type: "revenue" | "expense" | "both",
) {
  if (parent && parent.type !== "both" && parent.type !== type) {
    throw invalid(
      `Danh mục con phải cùng loại với danh mục cha "${parent.name}" (${parent.type === "revenue" ? "thu" : "chi"})`,
    );
  }
}

export async function createCategory(input: CreateCategoryInput) {
  const prisma = getPrisma();
  const parent = input.parentId
    ? await prisma.revenueExpenseCategory.findUnique({ where: { id: input.parentId } })
    : null;
  if (input.parentId && !parent) throw notFound(`Danh mục cha #${input.parentId} không tồn tại`);
  assertChildType(parent, input.type);
  const code = input.code ?? (await uniqueCategoryCode(slugCode(input.name)));
  try {
    return await prisma.revenueExpenseCategory.create({
      data: {
        name: input.name,
        code,
        type: input.type,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 100,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`Mã danh mục "${code}" đã tồn tại`);
    throw e;
  }
}

export async function updateCategory(input: UpdateCategoryInput) {
  const prisma = getPrisma();
  const cat = await prisma.revenueExpenseCategory.findUnique({ where: { id: input.id } });
  if (!cat) throw notFound(`Danh mục #${input.id} không tồn tại`);
  const isSystem = (SYSTEM_CATEGORY_CODES as readonly string[]).includes(cat.code);
  if (isSystem && input.type !== undefined && input.type !== cat.type)
    throw conflict(`Không đổi loại của danh mục hệ thống "${cat.name}"`);
  if (input.isActive === false && LOCKED_CATEGORY_CODES.includes(cat.code))
    throw conflict(`Danh mục "${cat.name}" dùng cho phiếu tự động — không ngừng sử dụng được`);

  const type = input.type ?? cat.type;
  const parentId = input.parentId === undefined ? cat.parentId : input.parentId;
  if (input.parentId !== undefined) {
    const all = await allCategories();
    if (wouldCycle(all, cat.id, input.parentId))
      throw invalid("Không thể chuyển danh mục vào chính nó hoặc danh mục con của nó");
  }
  const parent = parentId
    ? await prisma.revenueExpenseCategory.findUnique({ where: { id: parentId } })
    : null;
  if (parentId && !parent) throw notFound(`Danh mục cha #${parentId} không tồn tại`);
  assertChildType(parent, type);
  if (input.type !== undefined && input.type !== "both") {
    // Existing records must still fit the category
    const clash = await prisma.revenueExpenseRecord.count({
      where: { categoryId: cat.id, type: input.type === "revenue" ? "expense" : "revenue" },
    });
    if (clash)
      throw conflict(
        `Danh mục đang có ${clash} phiếu ${input.type === "revenue" ? "chi" : "thu"} — không đổi loại được`,
      );
  }
  return prisma.revenueExpenseCategory.update({
    where: { id: cat.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      type,
      parentId,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteCategory(id: number) {
  const prisma = getPrisma();
  const cat = await prisma.revenueExpenseCategory.findUnique({
    where: { id },
    include: { _count: { select: { children: true, revenueExpenseRecords: true } } },
  });
  if (!cat) throw notFound(`Danh mục #${id} không tồn tại`);
  if ((SYSTEM_CATEGORY_CODES as readonly string[]).includes(cat.code))
    throw conflict(`Không xoá danh mục hệ thống "${cat.name}"`);
  if (cat._count.children) throw conflict(`Danh mục "${cat.name}" còn danh mục con`);
  if (cat._count.revenueExpenseRecords)
    throw conflict(
      `Danh mục "${cat.name}" đã có ${cat._count.revenueExpenseRecords} phiếu — hãy ngừng sử dụng thay vì xoá`,
    );
  await prisma.revenueExpenseCategory.delete({ where: { id } });
  return { id };
}

/** Category by code inside a transaction, created from the defaults when missing */
async function ensureSystemCategory(tx: Tx, code: string) {
  const found = await tx.revenueExpenseCategory.findUnique({ where: { code } });
  if (found) return found;
  const def = SYSTEM_CATEGORY_DEFAULTS[code];
  if (!def) throw invalid(`Thiếu danh mục thu chi "${code}" — chạy npm run db:seed`);
  return tx.revenueExpenseCategory.create({ data: { code, ...def, sortOrder: 100 } });
}

// ─── Records ─────────────────────────────────────────────────────────────────

async function nextDocCode(tx: Tx, type: RecordType, dateKey: string): Promise<string> {
  const base = docCode(type, dateKey, 0).slice(0, -4);
  const last = await tx.revenueExpenseRecord.findFirst({
    where: { code: { startsWith: base } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  return docCode(type, dateKey, nextSeq(last?.code, base));
}

interface PostRecord {
  type: RecordType;
  categoryId: number;
  fundId: number | null;
  branchId: number | null;
  amount: number;
  date: string;
  description: string | null;
  partnerName: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  userId: number | null;
}

/** Write a record and its fund movement (inside `tx`) */
async function writeRecord(tx: Tx, r: PostRecord, categoryName: string) {
  const code = await nextDocCode(tx, r.type, r.date);
  const rec = await tx.revenueExpenseRecord.create({
    data: {
      code,
      type: r.type,
      categoryId: r.categoryId,
      fundId: r.fundId,
      branchId: r.branchId,
      amount: round2(r.amount),
      date: dbDate(r.date),
      description: r.description,
      partnerName: r.partnerName,
      referenceType: r.referenceType ?? null,
      referenceId: r.referenceId ?? null,
      createdBy: r.userId,
    },
  });
  if (r.fundId) {
    await postMovement(tx, {
      fundId: r.fundId,
      direction: directionOf(r.type),
      amount: r.amount,
      referenceType: FUND_REFERENCE.record,
      referenceId: rec.id,
      description: `${code} — ${r.description || categoryName}`,
      userId: r.userId,
    });
  }
  return rec;
}

/**
 * Phiếu sinh tự động từ module khác, trong transaction của nghiệp vụ gốc (thanh toán NCC → phiếu
 * chi "Tiền nhập hàng"; khách trả nợ → phiếu thu "Thu nợ khách hàng"). Quỹ đã được kiểm quyền
 * chi nhánh ở router. Tạo mã trùng do chạy đồng thời → lỗi CONFLICT, người dùng thử lại.
 */
export async function postAutoRecord(
  tx: Tx,
  r: Omit<PostRecord, "categoryId"> & { categoryCode: string },
) {
  const cat = await ensureSystemCategory(tx, r.categoryCode);
  try {
    return await writeRecord(tx, { ...r, categoryId: cat.id }, cat.name);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("Đang ghi phiếu thu chi khác, vui lòng thử lại");
    throw e;
  }
}

async function loadCategoryFor(categoryId: number, type: RecordType) {
  const cat = await getPrisma().revenueExpenseCategory.findUnique({ where: { id: categoryId } });
  if (!cat) throw notFound(`Danh mục #${categoryId} không tồn tại`);
  if (!cat.isActive) throw conflict(`Danh mục "${cat.name}" đã ngừng sử dụng`);
  if (!categoryAccepts(cat.type, type))
    throw invalid(
      `Danh mục "${cat.name}" không dùng cho phiếu ${type === "revenue" ? "thu" : "chi"}`,
    );
  return cat;
}

function checkDate(date: string) {
  if (date > todayKey()) throw invalid("Ngày chứng từ không được ở tương lai");
}

export async function createRecord(
  input: CreateRecordInput,
  scope: BranchScope,
  userId: number | null,
) {
  const date = input.date ?? todayKey();
  checkDate(date);
  const cat = await loadCategoryFor(input.categoryId, input.type);
  const fund = input.fundId ? await assertFund(scope, input.fundId) : null;
  if (fund && !fund.isActive) throw conflict(`Quỹ "${fund.name}" đã ngừng sử dụng`);
  if (fund?.branchId && input.branchId && input.branchId !== fund.branchId)
    throw invalid(`Quỹ "${fund.name}" thuộc chi nhánh khác`);
  const branchId = fund?.branchId ?? input.branchId ?? scope.current ?? null;
  assertBranch(scope, branchId);
  if (branchId === null && !scope.canAll)
    throw bizoneError("FORBIDDEN", "Chọn chi nhánh cho phiếu thu chi");

  const rec = await withCodeRetry(() =>
    getPrisma().$transaction((tx) =>
      writeRecord(
        tx,
        {
          type: input.type,
          categoryId: cat.id,
          fundId: fund?.id ?? null,
          branchId,
          amount: input.amount,
          date,
          description: input.description || null,
          partnerName: input.partnerName || null,
          userId,
        },
        cat.name,
      ),
    ),
  );
  return getRecord(rec.id, scope);
}

async function loadEditable(id: number, scope: BranchScope) {
  const rec = await getPrisma().revenueExpenseRecord.findUnique({ where: { id } });
  if (!rec) throw notFound(`Phiếu thu chi #${id} không tồn tại`);
  assertBranch(scope, rec.branchId);
  if (rec.status !== "active") throw conflict(`Phiếu ${rec.code} đã huỷ`);
  if (rec.referenceType) {
    throw conflict(
      `Phiếu ${rec.code} sinh tự động (${RECORD_SOURCE_LABEL[rec.referenceType] ?? rec.referenceType}) — điều chỉnh ở nghiệp vụ gốc`,
    );
  }
  return rec;
}

/** Re-read the record under lock: status, amount and fund must still be what we based on */
async function lockRecord(
  tx: Tx,
  rec: { id: number; amount: Prisma.Decimal; fundId: number | null },
) {
  await tx.$queryRaw`SELECT id FROM revenue_expense_records WHERE id = ${rec.id} FOR UPDATE`;
  const row = await tx.revenueExpenseRecord.findUnique({
    where: { id: rec.id },
    select: { status: true, amount: true, fundId: true },
  });
  if (
    !row ||
    row.status !== "active" ||
    num(row.amount) !== num(rec.amount) ||
    row.fundId !== rec.fundId
  )
    throw conflict("Phiếu vừa được cập nhật, vui lòng tải lại");
}

export async function updateRecord(
  input: UpdateRecordInput,
  scope: BranchScope,
  userId: number | null,
) {
  const rec = await loadEditable(input.id, scope);
  const date = input.date ?? dateOnly(rec.date);
  checkDate(date);
  const cat =
    input.categoryId && input.categoryId !== rec.categoryId
      ? await loadCategoryFor(input.categoryId, rec.type)
      : null;
  const newFundId = input.fundId === undefined ? rec.fundId : input.fundId;
  const fund = newFundId && newFundId !== rec.fundId ? await assertFund(scope, newFundId) : null;
  if (fund && !fund.isActive) throw conflict(`Quỹ "${fund.name}" đã ngừng sử dụng`);
  if (fund?.branchId && rec.branchId && fund.branchId !== rec.branchId)
    throw invalid(`Quỹ "${fund.name}" thuộc chi nhánh khác với phiếu`);
  const amount = input.amount ?? num(rec.amount);
  const moneyChanged = newFundId !== rec.fundId || round2(amount) !== num(rec.amount);
  const direction = directionOf(rec.type);

  await getPrisma().$transaction(async (tx) => {
    await lockRecord(tx, rec);
    if (moneyChanged) {
      if (rec.fundId) {
        await postMovement(tx, {
          fundId: rec.fundId,
          direction: opposite(direction),
          amount: num(rec.amount),
          referenceType: FUND_REFERENCE.reversal,
          referenceId: rec.id,
          description: `Sửa phiếu ${rec.code}: đảo ${num(rec.amount).toLocaleString("vi-VN")}₫`,
          userId,
          allowInactive: true,
          // the new movement below re-checks the balance when it lands on the same fund
          allowNegative: newFundId === rec.fundId,
        });
      }
      if (newFundId) {
        await postMovement(tx, {
          fundId: newFundId,
          direction,
          amount,
          referenceType: FUND_REFERENCE.record,
          referenceId: rec.id,
          description: `${rec.code} (sửa) — ${input.description ?? rec.description ?? ""}`.trim(),
          userId,
        });
      }
    }
    await tx.revenueExpenseRecord.update({
      where: { id: rec.id },
      data: {
        ...(cat ? { categoryId: cat.id } : {}),
        fundId: newFundId,
        ...(fund?.branchId ? { branchId: fund.branchId } : {}),
        amount: round2(amount),
        date: dbDate(date),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.partnerName !== undefined ? { partnerName: input.partnerName || null } : {}),
        updatedBy: userId,
      },
    });
  });
  return getRecord(rec.id, scope);
}

export async function cancelRecord(
  input: CancelRecordInput,
  scope: BranchScope,
  userId: number | null,
) {
  const rec = await loadEditable(input.id, scope);
  await getPrisma().$transaction(async (tx) => {
    await lockRecord(tx, rec);
    if (rec.fundId) {
      await postMovement(tx, {
        fundId: rec.fundId,
        direction: opposite(directionOf(rec.type)),
        amount: num(rec.amount),
        referenceType: FUND_REFERENCE.reversal,
        referenceId: rec.id,
        description: `Huỷ phiếu ${rec.code}: ${input.reason}`,
        userId,
        allowInactive: true,
      });
    }
    await tx.revenueExpenseRecord.update({
      where: { id: rec.id },
      data: {
        status: "cancelled",
        cancelReason: input.reason,
        cancelledAt: new Date(),
        cancelledBy: userId,
        updatedBy: userId,
      },
    });
  });
  return getRecord(rec.id, scope);
}

const recordInclude = {
  category: { select: { id: true, name: true, code: true } },
  fund: { select: { id: true, name: true, code: true, type: true } },
  branch: { select: { id: true, name: true } },
  createdByUser: { select: { fullName: true, username: true } },
  cancelledByUser: { select: { fullName: true, username: true } },
} satisfies Prisma.RevenueExpenseRecordInclude;

type RecordRow = Prisma.RevenueExpenseRecordGetPayload<{ include: typeof recordInclude }>;

function recordView(r: RecordRow) {
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    status: r.status,
    date: dateOnly(r.date),
    amount: num(r.amount),
    description: r.description,
    partnerName: r.partnerName,
    category: r.category,
    fund: r.fund,
    branch: r.branch,
    source: r.referenceType,
    sourceLabel: r.referenceType ? (RECORD_SOURCE_LABEL[r.referenceType] ?? r.referenceType) : null,
    referenceId: r.referenceId,
    editable: r.status === "active" && !r.referenceType,
    createdBy: r.createdByUser?.fullName || r.createdByUser?.username || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    cancelReason: r.cancelReason,
    cancelledAt: r.cancelledAt,
    cancelledBy: r.cancelledByUser?.fullName || r.cancelledByUser?.username || null,
  };
}

export async function getRecord(id: number, scope: BranchScope) {
  const r = await getPrisma().revenueExpenseRecord.findUnique({
    where: { id },
    include: recordInclude,
  });
  if (!r) throw notFound(`Phiếu thu chi #${id} không tồn tại`);
  assertBranch(scope, r.branchId);
  const movements = await getPrisma().fundTransaction.findMany({
    where: {
      referenceType: { in: [FUND_REFERENCE.record, FUND_REFERENCE.reversal] },
      referenceId: id,
    },
    include: { fund: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  return {
    ...recordView(r),
    movements: movements.map((m) => ({
      id: m.id,
      fundName: m.fund.name,
      direction: m.type,
      amount: num(m.amount),
      balanceAfter: num(m.balanceAfter),
      description: m.description,
      at: m.createdAt,
    })),
  };
}

/**
 * Records visible in the branch scope. An explicit / current branch → that branch's records;
 * "all branches" (admin) → every record incl. store-wide ones (branch NULL).
 */
export function recordBranchWhere(
  scope: BranchScope,
  branchId: number | undefined,
): Prisma.RevenueExpenseRecordWhereInput {
  if (branchId) return { branchId };
  if (scope.canAll) return {};
  return { branchId: { in: scope.allowed } };
}

export async function listRecords(input: ListRecordsInput, scope: BranchScope) {
  const prisma = getPrisma();
  const branchId = input.branchId ?? scope.current ?? undefined;
  if (branchId) assertBranch(scope, branchId);
  let categoryIds: number[] | undefined;
  if (input.categoryId) categoryIds = subtreeIds(await allCategories(), input.categoryId);
  const search = input.search?.trim();
  const where: Prisma.RevenueExpenseRecordWhereInput = {
    ...recordBranchWhere(scope, branchId),
    ...(input.status === "all" ? {} : { status: input.status }),
    ...(input.type ? { type: input.type } : {}),
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(input.fundId ? { fundId: input.fundId } : {}),
    ...(input.from || input.to
      ? {
          date: {
            ...(input.from ? { gte: dbDate(input.from) } : {}),
            ...(input.to ? { lte: dbDate(input.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search } },
            { description: { contains: search } },
            { partnerName: { contains: search } },
          ],
        }
      : {}),
  };
  const [rows, total, sums] = await Promise.all([
    prisma.revenueExpenseRecord.findMany({
      where,
      include: recordInclude,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.revenueExpenseRecord.count({ where }),
    prisma.revenueExpenseRecord.groupBy({
      by: ["type"],
      where: { ...where, status: "active" },
      _sum: { amount: true },
      orderBy: { type: "asc" },
    }),
  ]);
  const sumOf = (t: RecordType) => round2(num(sums.find((s) => s.type === t)?._sum.amount));
  return {
    items: rows.map(recordView),
    totals: {
      revenue: sumOf("revenue"),
      expense: sumOf("expense"),
      net: round2(sumOf("revenue") - sumOf("expense")),
    },
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}
