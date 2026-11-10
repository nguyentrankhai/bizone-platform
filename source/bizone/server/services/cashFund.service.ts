import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { vnDateKey, vnDateKeyRange } from "@/lib/vn-time";
import { applyMovement, round2, subtreeIds, type Direction } from "@/lib/accounting/calc";
import type {
  AdjustFundInput,
  CreateFundInput,
  DepositSessionInput,
  FundLedgerInput,
  ListFundsInput,
  TransferInput,
  UpdateFundInput,
} from "@/lib/validators/accounting";
import { assertBranch, type BranchScope } from "@/server/middleware/branchScope";

/**
 * Quỹ tiền (SRS-ACC-02): quỹ tiền mặt / tài khoản ngân hàng, mỗi quỹ một số dư.
 *
 * Mọi thay đổi số dư đi qua `postMovement` trong một DB transaction: khoá dòng quỹ
 * (`SELECT … FOR UPDATE`), tính số dư mới, ghi `fund_transactions` (số dư trước / sau). Biến động
 * chỉ thêm, không sửa / xoá — sửa hay huỷ phiếu thu chi ghi một biến động đảo chiều. Vì vậy sổ
 * quỹ (theo thứ tự ghi sổ) luôn khớp số dư của quỹ.
 *
 * `reference_type` của biến động: record (phiếu thu / chi), record_reversal (đảo phiếu khi sửa /
 * huỷ), opening (số dư đầu), transfer_out / transfer_in, adjustment (kiểm quỹ), cash_session
 * (nộp tiền ca POS).
 */

type Tx = Prisma.TransactionClient;

const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);
const num = (v: Prisma.Decimal | number | bigint | null | undefined) => Number(v ?? 0);

export const FUND_REFERENCE = {
  record: "record",
  reversal: "record_reversal",
  opening: "opening",
  transferOut: "transfer_out",
  transferIn: "transfer_in",
  adjustment: "adjustment",
  cashSession: "cash_session",
} as const;

export interface Movement {
  fundId: number;
  direction: Direction;
  amount: number;
  referenceType: string;
  referenceId?: number | null;
  description?: string | null;
  userId: number | null;
  /** Reversing an earlier movement: allowed on a fund no longer in use */
  allowInactive?: boolean;
  /** Intermediate step of an edit (the final balance is checked by the next movement) */
  allowNegative?: boolean;
}

/** Post one movement on a fund (call inside a transaction) → the fund_transactions row */
export async function postMovement(tx: Tx, m: Movement) {
  const rows = await tx.$queryRaw<{ balance: unknown; is_active: unknown; name: string }[]>`
    SELECT balance, is_active, name FROM cash_funds WHERE id = ${m.fundId} FOR UPDATE`;
  const fund = rows[0];
  if (!fund) throw notFound(`Quỹ #${m.fundId} không tồn tại`);
  if (!m.allowInactive && !Number(fund.is_active))
    throw conflict(`Quỹ "${fund.name}" đã ngừng sử dụng`);
  const before = num(fund.balance as number);
  let after: number;
  try {
    after = applyMovement(before, m.direction, round2(m.amount), m.allowNegative);
  } catch (e) {
    throw conflict(`${e instanceof Error ? e.message : String(e)} — quỹ "${fund.name}"`);
  }
  await tx.cashFund.update({ where: { id: m.fundId }, data: { balance: after } });
  return tx.fundTransaction.create({
    data: {
      fundId: m.fundId,
      type: m.direction,
      amount: round2(m.amount),
      balanceBefore: before,
      balanceAfter: after,
      referenceType: m.referenceType,
      referenceId: m.referenceId ?? null,
      description: m.description ?? null,
      createdBy: m.userId,
    },
  });
}

// ─── Funds ───────────────────────────────────────────────────────────────────

/** Funds visible in the branch scope: the branch's funds + store-wide funds (branch NULL) */
export function fundScopeWhere(scope: BranchScope, branchId?: number): Prisma.CashFundWhereInput {
  const b = branchId ?? scope.current ?? undefined;
  if (b) return { OR: [{ branchId: b }, { branchId: null }] };
  if (scope.canAll) return {};
  return { OR: [{ branchId: { in: scope.allowed } }, { branchId: null }] };
}

export async function getFund(id: number) {
  const fund = await getPrisma().cashFund.findUnique({
    where: { id },
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!fund) throw notFound(`Quỹ #${id} không tồn tại`);
  return fund;
}

/** The fund exists and belongs to a branch the user may access (store-wide funds always do) */
export async function assertFund(scope: BranchScope, id: number) {
  const fund = await getFund(id);
  assertBranch(scope, fund.branchId);
  return fund;
}

function fundView(f: Awaited<ReturnType<typeof getFund>>) {
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    type: f.type,
    accountNo: f.accountNo,
    description: f.description,
    balance: num(f.balance),
    isActive: f.isActive,
    branchId: f.branchId,
    branchName: f.branch?.name ?? null,
    updatedAt: f.updatedAt,
  };
}

export async function listFunds(input: ListFundsInput, scope: BranchScope) {
  if (input.branchId) assertBranch(scope, input.branchId);
  const funds = await getPrisma().cashFund.findMany({
    where: {
      ...fundScopeWhere(scope, input.branchId),
      ...(input.includeInactive ? {} : { isActive: true }),
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
  });
  const items = funds.map(fundView);
  const active = items.filter((f) => f.isActive);
  return {
    items,
    totals: {
      cash: round2(active.filter((f) => f.type === "cash").reduce((s, f) => s + f.balance, 0)),
      bank: round2(active.filter((f) => f.type === "bank").reduce((s, f) => s + f.balance, 0)),
      all: round2(active.reduce((s, f) => s + f.balance, 0)),
    },
  };
}

/** Active funds for selects (phiếu thu chi, thanh toán NCC / công nợ khách) */
export async function fundOptions(scope: BranchScope) {
  const funds = await getPrisma().cashFund.findMany({
    where: { ...fundScopeWhere(scope), isActive: true },
    select: { id: true, code: true, name: true, type: true, balance: true, branchId: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return funds.map((f) => ({ ...f, balance: num(f.balance) }));
}

async function nextFundCode(tx: Tx): Promise<string> {
  const last = await tx.cashFund.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  for (let n = (last?.id ?? 0) + 1; ; n++) {
    const code = `QUY${String(n).padStart(3, "0")}`;
    if (!(await tx.cashFund.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createFund(
  input: CreateFundInput,
  scope: BranchScope,
  userId: number | null,
) {
  // A user limited to some branches creates funds of their branch only
  const branchId =
    input.branchId === undefined ? (scope.canAll ? null : scope.current) : input.branchId;
  if (branchId === null && !scope.canAll)
    throw bizoneError("FORBIDDEN", "Chỉ quản trị viên được tạo quỹ chung toàn cửa hàng");
  assertBranch(scope, branchId);
  if (input.type === "bank" && !input.accountNo?.trim())
    throw invalid("Nhập số tài khoản cho quỹ ngân hàng");
  try {
    return await getPrisma().$transaction(async (tx) => {
      const fund = await tx.cashFund.create({
        data: {
          code: input.code?.toUpperCase() ?? (await nextFundCode(tx)),
          name: input.name,
          type: input.type,
          accountNo: input.accountNo || null,
          description: input.description || null,
          branchId,
          balance: 0,
        },
      });
      if (input.openingBalance > 0) {
        await postMovement(tx, {
          fundId: fund.id,
          direction: "in",
          amount: input.openingBalance,
          referenceType: FUND_REFERENCE.opening,
          description: "Số dư đầu kỳ",
          userId,
        });
      }
      return { id: fund.id, code: fund.code };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`Mã quỹ "${input.code}" đã tồn tại`);
    throw e;
  }
}

export async function updateFund(input: UpdateFundInput, scope: BranchScope) {
  const fund = await assertFund(scope, input.id);
  if (input.branchId !== undefined && input.branchId !== fund.branchId) {
    if (input.branchId === null && !scope.canAll)
      throw bizoneError("FORBIDDEN", "Chỉ quản trị viên được đổi thành quỹ chung");
    assertBranch(scope, input.branchId);
  }
  if (input.isActive === false && fund.isActive && num(fund.balance) !== 0) {
    throw conflict(
      `Quỹ "${fund.name}" còn số dư ${num(fund.balance).toLocaleString("vi-VN")}₫ — chuyển hết sang quỹ khác trước khi ngừng sử dụng`,
    );
  }
  const accountNo = input.accountNo === undefined ? fund.accountNo : input.accountNo || null;
  if (fund.type === "bank" && !accountNo) throw invalid("Nhập số tài khoản cho quỹ ngân hàng");
  await getPrisma().cashFund.update({
    where: { id: fund.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      accountNo,
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return fundView(await getFund(fund.id));
}

/** Chuyển tiền giữa hai quỹ (vd nộp tiền mặt vào ngân hàng) */
export async function transferFunds(
  input: TransferInput,
  scope: BranchScope,
  userId: number | null,
) {
  const [from, to] = await Promise.all([
    assertFund(scope, input.fromFundId),
    assertFund(scope, input.toFundId),
  ]);
  const note = input.description || `Chuyển từ "${from.name}" sang "${to.name}"`;
  return getPrisma().$transaction(async (tx) => {
    // Lock both funds in id order so two opposite transfers can't deadlock
    const [first, second] = from.id < to.id ? [from, to] : [to, from];
    await tx.$queryRaw`SELECT id FROM cash_funds WHERE id IN (${first.id}, ${second.id}) ORDER BY id FOR UPDATE`;
    const out = await postMovement(tx, {
      fundId: from.id,
      direction: "out",
      amount: input.amount,
      referenceType: FUND_REFERENCE.transferOut,
      description: note,
      userId,
    });
    const inn = await postMovement(tx, {
      fundId: to.id,
      direction: "in",
      amount: input.amount,
      referenceType: FUND_REFERENCE.transferIn,
      referenceId: out.id,
      description: note,
      userId,
    });
    await tx.fundTransaction.update({ where: { id: out.id }, data: { referenceId: inn.id } });
    return { outId: out.id, inId: inn.id, amount: round2(input.amount) };
  });
}

/** Kiểm quỹ: đưa số dư về số đếm thực tế, chênh lệch ghi thành biến động điều chỉnh */
export async function adjustFund(
  input: AdjustFundInput,
  scope: BranchScope,
  userId: number | null,
) {
  await assertFund(scope, input.fundId);
  return getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ balance: unknown }[]>`
      SELECT balance FROM cash_funds WHERE id = ${input.fundId} FOR UPDATE`;
    const diff = round2(input.actualBalance - num(rows[0]?.balance as number));
    if (diff === 0) throw conflict("Số dư thực tế khớp số dư sổ sách — không cần điều chỉnh");
    const t = await postMovement(tx, {
      fundId: input.fundId,
      direction: diff > 0 ? "in" : "out",
      amount: Math.abs(diff),
      referenceType: FUND_REFERENCE.adjustment,
      description: `Kiểm quỹ: ${input.reason}`,
      userId,
    });
    return { transactionId: t.id, difference: diff, balance: num(t.balanceAfter) };
  });
}

// ─── POS shift cash → fund (đối soát cuối ca) ────────────────────────────────

/** Closed POS shifts of the last `days` days with their cash count and deposit status */
export async function sessionsToDeposit(days: number, scope: BranchScope) {
  const prisma = getPrisma();
  const since = new Date(Date.now() - days * 86_400_000);
  const branchIds = scope.current !== null ? [scope.current] : scope.canAll ? null : scope.allowed;
  const sessions = await prisma.cashSession.findMany({
    where: {
      status: "closed",
      closedAt: { gte: since },
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    },
    include: {
      branch: { select: { name: true } },
      user: { select: { fullName: true, username: true } },
    },
    orderBy: { closedAt: "desc" },
    take: 200,
  });
  const deposits = await prisma.fundTransaction.findMany({
    where: {
      referenceType: FUND_REFERENCE.cashSession,
      referenceId: { in: sessions.map((s) => s.id) },
    },
    include: { fund: { select: { name: true } } },
  });
  const bySession = new Map(deposits.map((d) => [d.referenceId, d]));
  return sessions.map((s) => {
    const d = bySession.get(s.id);
    return {
      sessionId: s.id,
      branchId: s.branchId,
      branchName: s.branch.name,
      cashier: s.user.fullName || s.user.username,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingBalance: num(s.openingBalance),
      expectedCash: num(s.closingBalance),
      actualCash: s.actualClosingBalance === null ? null : num(s.actualClosingBalance),
      difference: s.difference === null ? null : num(s.difference),
      deposit: d
        ? {
            transactionId: d.id,
            fundId: d.fundId,
            fundName: d.fund.name,
            amount: num(d.amount),
            at: d.createdAt,
          }
        : null,
    };
  });
}

/** Nộp tiền mặt của một ca POS đã khoá vào quỹ (mỗi ca một lần) */
export async function depositSession(
  input: DepositSessionInput,
  scope: BranchScope,
  userId: number | null,
) {
  const prisma = getPrisma();
  const session = await prisma.cashSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw notFound(`Ca #${input.sessionId} không tồn tại`);
  assertBranch(scope, session.branchId);
  if (session.status !== "closed") throw conflict(`Ca #${session.id} chưa khoá`);
  const fund = await assertFund(scope, input.fundId);
  if (fund.branchId !== null && fund.branchId !== session.branchId)
    throw invalid(`Quỹ "${fund.name}" thuộc chi nhánh khác với ca #${session.id}`);
  const amount = input.amount ?? num(session.actualClosingBalance);
  if (!(amount > 0)) throw invalid(`Ca #${session.id} không có tiền mặt để nộp`);

  return prisma.$transaction(async (tx) => {
    // One deposit per shift: serialize on the session row, then check
    await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${session.id} FOR UPDATE`;
    const done = await tx.fundTransaction.findFirst({
      where: { referenceType: FUND_REFERENCE.cashSession, referenceId: session.id },
      select: { id: true },
    });
    if (done) throw conflict(`Tiền ca #${session.id} đã được nộp vào quỹ`);
    const t = await postMovement(tx, {
      fundId: fund.id,
      direction: "in",
      amount,
      referenceType: FUND_REFERENCE.cashSession,
      referenceId: session.id,
      description:
        input.description ||
        `Nộp tiền ca #${session.id} (${vnDateKey(session.closedAt ?? new Date())})`,
      userId,
    });
    return { transactionId: t.id, amount: round2(amount), balance: num(t.balanceAfter) };
  });
}

// ─── Sổ quỹ ──────────────────────────────────────────────────────────────────

const REFERENCE_LABEL: Record<string, string> = {
  [FUND_REFERENCE.opening]: "Số dư đầu kỳ",
  [FUND_REFERENCE.transferOut]: "Chuyển quỹ đi",
  [FUND_REFERENCE.transferIn]: "Nhận chuyển quỹ",
  [FUND_REFERENCE.adjustment]: "Điều chỉnh kiểm quỹ",
  [FUND_REFERENCE.cashSession]: "Nộp tiền ca POS",
};

/**
 * Sổ quỹ của một quỹ trong khoảng ngày (theo thời điểm ghi sổ, giờ VN): tồn đầu kỳ, từng biến
 * động với số dư sau biến động, tổng thu / chi, tồn cuối kỳ. Lọc theo danh mục chỉ giữ biến động
 * của phiếu thu chi thuộc danh mục đó (số dư từng dòng vẫn là số dư thật của quỹ).
 */
export async function fundLedger(input: FundLedgerInput, scope: BranchScope) {
  const prisma = getPrisma();
  const fund = await assertFund(scope, input.fundId);
  const { start, end } = vnDateKeyRange(input.from, input.to);

  let recordIds: number[] | null = null;
  if (input.categoryId) {
    const all = await prisma.revenueExpenseCategory.findMany({
      select: { id: true, parentId: true, code: true },
    });
    const cats = subtreeIds(all, input.categoryId);
    const recs = await prisma.revenueExpenseRecord.findMany({
      where: { fundId: fund.id, categoryId: { in: cats } },
      select: { id: true },
    });
    recordIds = recs.map((r) => r.id);
  }

  const where: Prisma.FundTransactionWhereInput = {
    fundId: fund.id,
    createdAt: { gte: start, lt: end },
    ...(input.direction ? { type: input.direction } : {}),
    ...(recordIds
      ? {
          referenceType: { in: [FUND_REFERENCE.record, FUND_REFERENCE.reversal] },
          referenceId: { in: recordIds },
        }
      : {}),
  };

  const [openingRow, closingRow, sums, total, rows] = await Promise.all([
    prisma.fundTransaction.findFirst({
      where: { fundId: fund.id, createdAt: { lt: start } },
      orderBy: { id: "desc" },
      select: { balanceAfter: true },
    }),
    prisma.fundTransaction.findFirst({
      where: { fundId: fund.id, createdAt: { lt: end } },
      orderBy: { id: "desc" },
      select: { balanceAfter: true },
    }),
    prisma.fundTransaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { type: "asc" },
    }),
    prisma.fundTransaction.count({ where }),
    prisma.fundTransaction.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { createdByUser: { select: { fullName: true, username: true } } },
    }),
  ]);

  const recIds = rows
    .filter(
      (r) =>
        (r.referenceType === FUND_REFERENCE.record ||
          r.referenceType === FUND_REFERENCE.reversal) &&
        r.referenceId,
    )
    .map((r) => r.referenceId!);
  const records = recIds.length
    ? await prisma.revenueExpenseRecord.findMany({
        where: { id: { in: recIds } },
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          partnerName: true,
          referenceType: true,
          category: { select: { id: true, name: true } },
        },
      })
    : [];
  const recById = new Map(records.map((r) => [r.id, r]));
  const sumOf = (t: "in" | "out") => num(sums.find((s) => s.type === t)?._sum.amount);

  const opening = num(openingRow?.balanceAfter);
  return {
    fund: fundView(fund),
    range: { from: input.from, to: input.to },
    opening,
    totalIn: round2(sumOf("in")),
    totalOut: round2(sumOf("out")),
    closing: closingRow ? num(closingRow.balanceAfter) : opening,
    filtered: Boolean(input.categoryId || input.direction),
    rows: rows.map((r) => {
      const rec =
        r.referenceType === FUND_REFERENCE.record || r.referenceType === FUND_REFERENCE.reversal
          ? recById.get(r.referenceId ?? 0)
          : undefined;
      return {
        id: r.id,
        at: r.createdAt,
        direction: r.type,
        amount: num(r.amount),
        balanceBefore: num(r.balanceBefore),
        balanceAfter: num(r.balanceAfter),
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        kind: rec
          ? r.referenceType === FUND_REFERENCE.reversal
            ? `Đảo phiếu ${rec.code ?? ""}`.trim()
            : rec.type === "revenue"
              ? "Phiếu thu"
              : "Phiếu chi"
          : (REFERENCE_LABEL[r.referenceType ?? ""] ?? "Biến động quỹ"),
        record: rec
          ? {
              id: rec.id,
              code: rec.code,
              status: rec.status,
              partnerName: rec.partnerName,
              categoryName: rec.category.name,
              source: rec.referenceType,
            }
          : null,
        description: r.description,
        createdBy: r.createdByUser?.fullName || r.createdByUser?.username || null,
      };
    }),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}
