import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { dbDate, vnDateKey, vnDateKeyRange } from "@/lib/vn-time";
import { CREDIT_METHODS } from "@/lib/validators/pos";
import {
  AGING_BUCKETS,
  agingBucket,
  daysOverdue,
  emptyAging,
  nonPnlCategoryIds,
  profitAndLoss,
  round2,
  type Aging,
} from "@/lib/accounting/calc";
import type {
  DebtSummaryInput,
  PeriodInput,
  ReconciliationInput,
} from "@/lib/validators/accounting";
import { assertBranch, type BranchScope } from "@/server/middleware/branchScope";
import { bucketsOf, salesByPeriod, salesTotals, type SalesScope } from "./report.service";
import { recordBranchWhere } from "./ledger.service";
import { FUND_REFERENCE, fundScopeWhere } from "./cashFund.service";

/**
 * Báo cáo tài chính (SRS-ACC-03…05): lời lỗ, dòng tiền, công nợ tổng hợp, đối soát thanh toán.
 *
 * Lời lỗ = doanh thu thuần bán hàng (hoá đơn POS, cùng quy tắc báo cáo P4.2) − giá vốn
 *        + thu khác − chi phí (phiếu thu / chi, trừ danh mục không tính lời lỗ: thu tiền bán
 *        hàng, thu nợ khách, tiền nhập hàng — xem NON_PNL_CATEGORY_CODES).
 * Dòng tiền = tiền thực thu / chi: thanh toán hoá đơn POS (trừ tiền thối, dòng cấn trừ), tiền
 *        cọc đơn đặt trước, hoàn tiền trả hàng / cọc, mọi phiếu thu / chi.
 * Đơn hàng online chưa tính (#61).
 */

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const isCredit = (m: string) => (CREDIT_METHODS as readonly string[]).includes(m);

interface Resolved {
  sales: SalesScope;
  records: Prisma.RevenueExpenseRecordWhereInput;
  /** Branch ids for raw SQL (null = every branch) */
  branchIds: number[] | null;
  branchId: number | null;
}

/** Branch scope of a report: explicit branch / current branch / every allowed branch */
function resolve(input: PeriodInput, scope: BranchScope): Resolved {
  const branchId = input.branchId ?? scope.current ?? undefined;
  if (branchId) assertBranch(scope, branchId);
  const branchIds = branchId ? [branchId] : scope.canAll ? null : scope.allowed;
  return {
    sales: {
      from: input.from,
      to: input.to,
      ...(branchId ? { branchId } : branchIds ? { branchIds } : {}),
    },
    records: {
      ...recordBranchWhere(scope, branchId),
      status: "active",
      date: { gte: dbDate(input.from), lte: dbDate(input.to) },
    },
    branchIds,
    branchId: branchId ?? null,
  };
}

async function categoryLabels() {
  const cats = await getPrisma().revenueExpenseCategory.findMany({
    select: { id: true, parentId: true, code: true, name: true },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const label = (id: number) => {
    const c = byId.get(id);
    if (!c) return `#${id}`;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  return { cats, label };
}

// ─── Lời lỗ ──────────────────────────────────────────────────────────────────

export async function profitLoss(input: PeriodInput, scope: BranchScope) {
  const r = resolve(input, scope);
  const { unit, keys } = bucketsOf(input.from, input.to);
  const prisma = getPrisma();
  const [{ cats, label }, sales, salesSeries, groups] = await Promise.all([
    categoryLabels(),
    salesTotals(r.sales),
    salesByPeriod(r.sales, unit),
    prisma.revenueExpenseRecord.groupBy({
      by: ["type", "categoryId", "date"],
      where: r.records,
      _sum: { amount: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const excluded = nonPnlCategoryIds(cats);

  const lines = new Map<string, { type: string; categoryId: number; amount: number }>();
  const outside = new Map<string, { type: string; categoryId: number; amount: number }>();
  const bucket = new Map<string, { income: number; expense: number }>();
  for (const g of groups) {
    const amount = num(g._sum.amount);
    const target = excluded.has(g.categoryId) ? outside : lines;
    const k = `${g.type}:${g.categoryId}`;
    const cur = target.get(k) ?? { type: g.type, categoryId: g.categoryId, amount: 0 };
    cur.amount += amount;
    target.set(k, cur);
    if (excluded.has(g.categoryId)) continue;
    const day = dateOnly(g.date);
    const bk = unit === "day" ? day : day.slice(0, 7);
    const b = bucket.get(bk) ?? { income: 0, expense: 0 };
    if (g.type === "revenue") b.income += amount;
    else b.expense += amount;
    bucket.set(bk, b);
  }
  const rows = (m: typeof lines, type: string) =>
    [...m.values()]
      .filter((l) => l.type === type)
      .map((l) => ({
        categoryId: l.categoryId,
        name: label(l.categoryId),
        amount: round2(l.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
  const income = rows(lines, "revenue");
  const expenses = rows(lines, "expense");
  const sum = (xs: { amount: number }[]) => round2(xs.reduce((s, x) => s + x.amount, 0));

  const pnl = profitAndLoss({
    netSales: sales.net,
    cogs: sales.cost,
    otherIncome: sum(income),
    expenses: sum(expenses),
  });
  return {
    range: { from: input.from, to: input.to },
    branchId: r.branchId,
    summary: pnl,
    sales: {
      gross: sales.gross,
      discount: sales.discount,
      refunds: sales.refunds,
      net: sales.net,
      cost: sales.cost,
      invoices: sales.invoices,
      noCostLines: sales.noCostLines,
    },
    otherIncome: income,
    expenses,
    excluded: [...outside.values()]
      .map((l) => ({
        categoryId: l.categoryId,
        name: label(l.categoryId),
        type: l.type,
        amount: round2(l.amount),
      }))
      .sort((a, b) => b.amount - a.amount),
    series: {
      unit,
      points: keys.map((k) => {
        const s = salesSeries.get(k);
        const b = bucket.get(k) ?? { income: 0, expense: 0 };
        const p = profitAndLoss({
          netSales: s?.net ?? 0,
          cogs: s?.cost ?? 0,
          otherIncome: b.income,
          expenses: b.expense,
        });
        return { key: k, revenue: p.revenue, cost: p.totalCost, profit: p.netProfit };
      }),
    },
  };
}

// ─── Dòng tiền ───────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
  wallet: "Ví điện tử",
  qr: "QR Code",
};

interface FlowLine {
  group: string;
  label: string;
  amount: number;
}

export async function cashFlow(input: PeriodInput, scope: BranchScope) {
  const r = resolve(input, scope);
  const prisma = getPrisma();
  const { start, end } = vnDateKeyRange(input.from, input.to);
  const { unit, keys } = bucketsOf(input.from, input.to);
  const bucketOf = (d: Date) => (unit === "day" ? vnDateKey(d) : vnDateKey(d).slice(0, 7));
  const branchSql = r.branchIds
    ? r.branchIds.length
      ? Prisma.sql`AND i.branch_id IN (${Prisma.join(r.branchIds)})`
      : Prisma.sql`AND FALSE`
    : Prisma.empty;

  const [salesIn, change, refundsOut, deposits, depositRefunds, records, { label }, funds] =
    await Promise.all([
      // Money received on invoices of the period (credit lines move no money)
      prisma.$queryRaw<{ method: string; k: string; amount: unknown }[]>`
        SELECT ip.payment_method AS method, DATE_FORMAT(i.created_at + INTERVAL 7 HOUR, '%Y-%m-%d') AS k,
          SUM(ip.amount) AS amount
        FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id
        WHERE ip.amount > 0 AND i.status <> 'cancelled'
          AND i.created_at >= ${start} AND i.created_at < ${end} ${branchSql}
        GROUP BY method, k`,
      prisma.$queryRaw<{ k: string; amount: unknown }[]>`
        SELECT DATE_FORMAT(i.created_at + INTERVAL 7 HOUR, '%Y-%m-%d') AS k, SUM(i.change_amount) AS amount
        FROM invoices i
        WHERE i.status <> 'cancelled' AND i.created_at >= ${start} AND i.created_at < ${end} ${branchSql}
        GROUP BY k`,
      // Refunds paid out when the return happened (negative payment rows)
      prisma.$queryRaw<{ method: string; k: string; amount: unknown }[]>`
        SELECT ip.payment_method AS method, DATE_FORMAT(ip.created_at + INTERVAL 7 HOUR, '%Y-%m-%d') AS k,
          -SUM(ip.amount) AS amount
        FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id
        WHERE ip.amount < 0 AND ip.created_at >= ${start} AND ip.created_at < ${end} ${branchSql}
        GROUP BY method, k`,
      prisma.preorder.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          depositAmount: { gt: 0 },
          ...(r.branchIds ? { branchId: { in: r.branchIds } } : {}),
        },
        select: { depositAmount: true, depositMethod: true, createdAt: true },
      }),
      prisma.preorder.findMany({
        where: {
          updatedAt: { gte: start, lt: end },
          refundAmount: { gt: 0 },
          ...(r.branchIds ? { branchId: { in: r.branchIds } } : {}),
        },
        select: { refundAmount: true, refundMethod: true, updatedAt: true },
      }),
      prisma.revenueExpenseRecord.groupBy({
        by: ["type", "categoryId", "date"],
        where: r.records,
        _sum: { amount: true },
        orderBy: { date: "asc" },
      }),
      categoryLabels(),
      fundBalances(scope, r.branchId ?? undefined, start, end),
    ]);

  const inflow = new Map<string, FlowLine>();
  const outflow = new Map<string, FlowLine>();
  const series = new Map<string, { in: number; out: number }>();
  const add = (
    map: Map<string, FlowLine>,
    key: string,
    group: string,
    lbl: string,
    amount: number,
    bucket: string,
  ) => {
    if (!amount) return;
    const cur = map.get(key) ?? { group, label: lbl, amount: 0 };
    cur.amount += amount;
    map.set(key, cur);
    const b = series.get(bucket) ?? { in: 0, out: 0 };
    if (map === inflow) b.in += amount;
    else b.out += amount;
    series.set(bucket, b);
  };
  const bk = (dayKey: string) => (unit === "day" ? dayKey : dayKey.slice(0, 7));

  for (const s of salesIn) {
    if (isCredit(s.method)) continue;
    add(
      inflow,
      `pos:${s.method}`,
      "pos",
      `Bán hàng — ${METHOD_LABEL[s.method] ?? s.method}`,
      num(s.amount),
      bk(s.k),
    );
  }
  // Change handed back reduces the cash received
  for (const c of change) {
    const amount = num(c.amount);
    if (!amount) continue;
    add(inflow, "pos:cash", "pos", "Bán hàng — Tiền mặt", -amount, bk(c.k));
  }
  for (const s of refundsOut) {
    if (isCredit(s.method)) continue;
    add(
      outflow,
      `refund:${s.method}`,
      "pos",
      `Hoàn tiền trả hàng — ${METHOD_LABEL[s.method] ?? s.method}`,
      num(s.amount),
      bk(s.k),
    );
  }
  for (const d of deposits) {
    add(
      inflow,
      `deposit:${d.depositMethod}`,
      "pos",
      `Tiền cọc đặt trước — ${METHOD_LABEL[d.depositMethod] ?? d.depositMethod}`,
      num(d.depositAmount),
      bucketOf(d.createdAt),
    );
  }
  for (const d of depositRefunds) {
    const m = d.refundMethod ?? "cash";
    add(
      outflow,
      `deposit_refund:${m}`,
      "pos",
      `Hoàn cọc — ${METHOD_LABEL[m] ?? m}`,
      num(d.refundAmount),
      bucketOf(d.updatedAt),
    );
  }
  for (const g of records) {
    const target = g.type === "revenue" ? inflow : outflow;
    add(
      target,
      `record:${g.categoryId}`,
      "record",
      label(g.categoryId),
      num(g._sum.amount),
      bk(dateOnly(g.date)),
    );
  }

  const list = (m: Map<string, FlowLine>) =>
    [...m.values()]
      .map((l) => ({ ...l, amount: round2(l.amount) }))
      .filter((l) => l.amount !== 0)
      .sort((a, b) => (a.group === b.group ? b.amount - a.amount : a.group === "pos" ? -1 : 1));
  const inflows = list(inflow);
  const outflows = list(outflow);
  const totalIn = round2(inflows.reduce((s, l) => s + l.amount, 0));
  const totalOut = round2(outflows.reduce((s, l) => s + l.amount, 0));
  return {
    range: { from: input.from, to: input.to },
    branchId: r.branchId,
    totalIn,
    totalOut,
    net: round2(totalIn - totalOut),
    inflows,
    outflows,
    funds,
    series: {
      unit,
      points: keys.map((k) => {
        const b = series.get(k) ?? { in: 0, out: 0 };
        return { key: k, in: round2(b.in), out: round2(b.out), net: round2(b.in - b.out) };
      }),
    },
  };
}

/** Balance of each visible fund at the start and the end of the period */
async function fundBalances(
  scope: BranchScope,
  branchId: number | undefined,
  start: Date,
  end: Date,
) {
  const prisma = getPrisma();
  const funds = await prisma.cashFund.findMany({
    where: fundScopeWhere(scope, branchId),
    select: { id: true, name: true, type: true, isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const at = async (fundId: number, before: Date) =>
    num(
      (
        await prisma.fundTransaction.findFirst({
          where: { fundId, createdAt: { lt: before } },
          orderBy: { id: "desc" },
          select: { balanceAfter: true },
        })
      )?.balanceAfter,
    );
  const rows = await Promise.all(
    funds.map(async (f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      opening: await at(f.id, start),
      closing: await at(f.id, end),
    })),
  );
  const shown = rows.filter(
    (f) => f.opening || f.closing || funds.find((x) => x.id === f.id)?.isActive,
  );
  return {
    items: shown,
    opening: round2(shown.reduce((s, f) => s + f.opening, 0)),
    closing: round2(shown.reduce((s, f) => s + f.closing, 0)),
  };
}

// ─── Công nợ tổng hợp ────────────────────────────────────────────────────────

interface OpenDebt {
  partyId: number;
  remaining: number;
  dueDate: string | null;
}

function summarizeDebts(debts: OpenDebt[], today: string) {
  const byParty = new Map<
    number,
    {
      remaining: number;
      overdue: number;
      count: number;
      oldestDue: string | null;
      maxDays: number;
      aging: Aging;
    }
  >();
  const aging = emptyAging();
  for (const d of debts) {
    const p = byParty.get(d.partyId) ?? {
      remaining: 0,
      overdue: 0,
      count: 0,
      oldestDue: null,
      maxDays: 0,
      aging: emptyAging(),
    };
    const b = agingBucket(d.dueDate, today);
    p.remaining += d.remaining;
    p.count += 1;
    p.aging[b] += d.remaining;
    aging[b] += d.remaining;
    if (b !== "current") {
      p.overdue += d.remaining;
      p.maxDays = Math.max(p.maxDays, daysOverdue(d.dueDate, today));
    }
    if (d.dueDate && (!p.oldestDue || d.dueDate < p.oldestDue)) p.oldestDue = d.dueDate;
    byParty.set(d.partyId, p);
  }
  for (const k of AGING_BUCKETS) aging[k] = round2(aging[k]);
  return { byParty, aging };
}

/** Công nợ phải thu (khách hàng) / phải trả (nhà cung cấp) theo đối tượng, kèm tuổi nợ */
export async function debtSummary(input: DebtSummaryInput) {
  const prisma = getPrisma();
  const today = vnDateKey(new Date());
  const debts: OpenDebt[] =
    input.kind === "receivable"
      ? (
          await prisma.customerDebt.findMany({
            where: { remainingAmount: { gt: 0 } },
            select: { customerId: true, remainingAmount: true, dueDate: true },
          })
        ).map((d) => ({
          partyId: d.customerId,
          remaining: num(d.remainingAmount),
          dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        }))
      : (
          await prisma.supplierDebt.findMany({
            where: { remainingAmount: { gt: 0 } },
            select: { supplierId: true, remainingAmount: true, dueDate: true },
          })
        ).map((d) => ({
          partyId: d.supplierId,
          remaining: num(d.remainingAmount),
          dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        }));

  const { byParty, aging } = summarizeDebts(debts, today);
  const ids = [...byParty.keys()];
  const parties =
    input.kind === "receivable"
      ? (
          await prisma.customer.findMany({
            where: { id: { in: ids } },
            select: { id: true, code: true, fullName: true, phone: true },
          })
        ).map((c) => ({ id: c.id, code: c.code, name: c.fullName, phone: c.phone }))
      : (
          await prisma.supplier.findMany({
            where: { id: { in: ids } },
            select: { id: true, code: true, name: true, phone: true },
          })
        ).map((s) => ({ id: s.id, code: s.code, name: s.name, phone: s.phone }));
  const search = input.search?.trim().toLowerCase();
  const rows = parties
    .map((p) => {
      const d = byParty.get(p.id)!;
      return {
        ...p,
        remaining: round2(d.remaining),
        overdue: round2(d.overdue),
        debtCount: d.count,
        oldestDue: d.oldestDue,
        maxDaysOverdue: d.maxDays,
        aging: Object.fromEntries(AGING_BUCKETS.map((k) => [k, round2(d.aging[k])])) as Aging,
      };
    })
    .filter((p) => !input.overdueOnly || p.overdue > 0)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search) ||
        p.code.toLowerCase().includes(search) ||
        (p.phone ?? "").includes(search),
    )
    .sort((a, b) => b.overdue - a.overdue || b.remaining - a.remaining);

  const total = rows.length;
  return {
    kind: input.kind,
    today,
    totals: {
      remaining: round2(debts.reduce((s, d) => s + d.remaining, 0)),
      overdue: round2(
        AGING_BUCKETS.filter((k) => k !== "current").reduce((s, k) => s + aging[k], 0),
      ),
      parties: byParty.size,
      overdueParties: [...byParty.values()].filter((p) => p.overdue > 0).length,
      aging,
    },
    items: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

/** Both sides at once for the overview */
export async function debtTotals() {
  const prisma = getPrisma();
  const today = dbDate(vnDateKey(new Date()));
  const [rc, rcOver, py, pyOver] = await Promise.all([
    prisma.customerDebt.aggregate({
      where: { remainingAmount: { gt: 0 } },
      _sum: { remainingAmount: true },
    }),
    prisma.customerDebt.aggregate({
      where: { remainingAmount: { gt: 0 }, dueDate: { lt: today } },
      _sum: { remainingAmount: true },
    }),
    prisma.supplierDebt.aggregate({
      where: { remainingAmount: { gt: 0 } },
      _sum: { remainingAmount: true },
    }),
    prisma.supplierDebt.aggregate({
      where: { remainingAmount: { gt: 0 }, dueDate: { lt: today } },
      _sum: { remainingAmount: true },
    }),
  ]);
  return {
    receivable: num(rc._sum.remainingAmount),
    receivableOverdue: num(rcOver._sum.remainingAmount),
    payable: num(py._sum.remainingAmount),
    payableOverdue: num(pyOver._sum.remainingAmount),
  };
}

// ─── Đối soát thanh toán ─────────────────────────────────────────────────────

export type IssueKind =
  | "underpaid"
  | "overpaid"
  | "unverified_electronic"
  | "intent_mismatch"
  | "unattached_payment"
  | "cash_difference"
  | "not_deposited";

export const ISSUE_LABEL: Record<IssueKind, string> = {
  underpaid: "Thu thiếu so với hoá đơn (không có công nợ tương ứng)",
  overpaid: "Thu thừa so với hoá đơn",
  unverified_electronic: "Thẻ / QR nhập tay — chưa có xác nhận Payment Hub",
  intent_mismatch: "Số tiền Payment Hub khác số ghi trên hoá đơn",
  unattached_payment: "Đã thu qua Payment Hub nhưng chưa gắn hoá đơn / đơn đặt",
  cash_difference: "Chênh lệch tiền mặt khi khoá ca",
  not_deposited: "Tiền ca chưa nộp vào quỹ",
};

/** Methods Payment Hub can confirm automatically (POS intents) */
const ELECTRONIC = ["card", "qr"] as const;

export async function reconciliation(input: ReconciliationInput, scope: BranchScope) {
  const r = resolve(input, scope);
  const prisma = getPrisma();
  const { start, end } = vnDateKeyRange(input.from, input.to);
  const branchWhere = r.branchIds ? { branchId: { in: r.branchIds } } : {};

  const [invoices, unattached, sessions] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "cancelled" }, ...branchWhere },
      select: {
        id: true,
        invoiceCode: true,
        createdAt: true,
        totalAmount: true,
        changeAmount: true,
        status: true,
        customerId: true,
        branch: { select: { name: true } },
        invoicePayments: { select: { paymentMethod: true, amount: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.posPaymentIntent.findMany({
      where: {
        status: "success",
        invoiceId: null,
        preorderId: null,
        paidAt: { gte: start, lt: end },
        ...(r.branchIds ? { cashSession: { branchId: { in: r.branchIds } } } : {}),
      },
      select: {
        id: true,
        method: true,
        amount: true,
        payhubTxnCode: true,
        paidAt: true,
        cashSessionId: true,
      },
    }),
    prisma.cashSession.findMany({
      where: { status: "closed", closedAt: { gte: start, lt: end }, ...branchWhere },
      select: {
        id: true,
        closedAt: true,
        difference: true,
        actualClosingBalance: true,
        branch: { select: { name: true } },
      },
    }),
  ]);
  const ids = invoices.map((i) => i.id);
  const [intents, debts, deposited] = await Promise.all([
    ids.length
      ? prisma.posPaymentIntent.findMany({
          where: { invoiceId: { in: ids }, status: "success" },
          select: { invoiceId: true, method: true, amount: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.customerDebt.findMany({
          where: { invoiceId: { in: ids } },
          select: { invoiceId: true, totalAmount: true },
        })
      : Promise.resolve([]),
    sessions.length
      ? prisma.fundTransaction.findMany({
          where: {
            referenceType: FUND_REFERENCE.cashSession,
            referenceId: { in: sessions.map((s) => s.id) },
          },
          select: { referenceId: true },
        })
      : Promise.resolve([]),
  ]);

  const confirmedBy = new Map<string, number>();
  for (const i of intents) {
    const k = `${i.invoiceId}:${i.method}`;
    confirmedBy.set(k, (confirmedBy.get(k) ?? 0) + num(i.amount));
  }
  const debtBy = new Map<number, number>();
  for (const d of debts)
    debtBy.set(d.invoiceId!, (debtBy.get(d.invoiceId!) ?? 0) + num(d.totalAmount));

  type MethodRow = {
    method: string;
    recorded: number;
    confirmed: number;
    unverified: number;
    count: number;
  };
  const methods = new Map<string, MethodRow>();
  const methodRow = (m: string) => {
    const row = methods.get(m) ?? { method: m, recorded: 0, confirmed: 0, unverified: 0, count: 0 };
    methods.set(m, row);
    return row;
  };

  const issues: {
    kind: IssueKind;
    severity: "error" | "warning" | "info";
    ref: string;
    refId: number;
    at: Date | null;
    branchName: string | null;
    amount: number;
    detail: string;
  }[] = [];
  const invoiceRows: {
    id: number;
    code: string;
    at: Date;
    branchName: string;
    total: number;
    received: number;
    debt: number;
    difference: number;
    methods: Record<string, number>;
    ok: boolean;
  }[] = [];
  let matched = 0;

  for (const inv of invoices) {
    const byMethod: Record<string, number> = {};
    for (const p of inv.invoicePayments) {
      const a = num(p.amount);
      if (a <= 0) continue; // refunds are reconciled with the return
      byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + a;
    }
    const change = num(inv.changeAmount);
    if (byMethod.cash) byMethod.cash -= change;
    const received = round2(Object.values(byMethod).reduce((s, v) => s + v, 0));
    const total = num(inv.totalAmount);
    const debt = round2(debtBy.get(inv.id) ?? 0);
    const difference = round2(received + debt - total);
    let ok = true;
    const base = {
      ref: inv.invoiceCode,
      refId: inv.id,
      at: inv.createdAt,
      branchName: inv.branch.name,
    };

    if (difference < 0) {
      ok = false;
      issues.push({
        ...base,
        kind: "underpaid",
        severity: "error",
        amount: -difference,
        detail: `Hoá đơn ${total.toLocaleString("vi-VN")}₫, đã thu ${received.toLocaleString("vi-VN")}₫${debt ? ` + ghi nợ ${debt.toLocaleString("vi-VN")}₫` : ""}`,
      });
    } else if (difference > 0) {
      ok = false;
      issues.push({
        ...base,
        kind: "overpaid",
        severity: "warning",
        amount: difference,
        detail: `Hoá đơn ${total.toLocaleString("vi-VN")}₫, đã thu ${received.toLocaleString("vi-VN")}₫`,
      });
    }

    for (const [m, amount] of Object.entries(byMethod)) {
      if (isCredit(m)) continue;
      const row = methodRow(m);
      row.recorded += amount;
      row.count += 1;
      if ((ELECTRONIC as readonly string[]).includes(m)) {
        const confirmed = confirmedBy.get(`${inv.id}:${m}`) ?? 0;
        row.confirmed += Math.min(confirmed, amount);
        const gap = round2(amount - confirmed);
        if (gap > 0) {
          row.unverified += gap;
          ok = false;
          issues.push({
            ...base,
            kind: confirmed > 0 ? "intent_mismatch" : "unverified_electronic",
            severity: "warning",
            amount: gap,
            detail: `${METHOD_LABEL[m] ?? m} ${amount.toLocaleString("vi-VN")}₫, Payment Hub xác nhận ${confirmed.toLocaleString("vi-VN")}₫`,
          });
        } else if (gap < 0) {
          ok = false;
          issues.push({
            ...base,
            kind: "intent_mismatch",
            severity: "warning",
            amount: -gap,
            detail: `${METHOD_LABEL[m] ?? m} ghi ${amount.toLocaleString("vi-VN")}₫ nhưng Payment Hub xác nhận ${confirmed.toLocaleString("vi-VN")}₫`,
          });
        }
      } else {
        // cash: reconciled at shift closing; transfer / wallet: against the bank statement
        row.unverified += m === "cash" ? 0 : amount;
        row.confirmed += m === "cash" ? amount : 0;
      }
    }
    if (ok) matched += 1;
    if (!input.onlyIssues || !ok) {
      invoiceRows.push({
        id: inv.id,
        code: inv.invoiceCode,
        at: inv.createdAt,
        branchName: inv.branch.name,
        total,
        received,
        debt,
        difference,
        methods: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, round2(v)])),
        ok,
      });
    }
  }

  for (const i of unattached) {
    issues.push({
      kind: "unattached_payment",
      severity: "error",
      ref: i.payhubTxnCode ?? `Intent #${i.id}`,
      refId: i.id,
      at: i.paidAt,
      branchName: null,
      amount: num(i.amount),
      detail: `${METHOD_LABEL[i.method] ?? i.method} — ca #${i.cashSessionId}: kiểm tra hoá đơn hoặc hoàn tiền cho khách`,
    });
  }
  const depositedIds = new Set(deposited.map((d) => d.referenceId));
  for (const s of sessions) {
    const diff = num(s.difference);
    if (diff) {
      issues.push({
        kind: "cash_difference",
        severity: Math.abs(diff) >= 50_000 ? "error" : "warning",
        ref: `Ca #${s.id}`,
        refId: s.id,
        at: s.closedAt,
        branchName: s.branch.name,
        amount: Math.abs(diff),
        detail:
          diff > 0
            ? `Thừa ${diff.toLocaleString("vi-VN")}₫`
            : `Thiếu ${(-diff).toLocaleString("vi-VN")}₫`,
      });
    }
    if (!depositedIds.has(s.id) && num(s.actualClosingBalance) > 0) {
      issues.push({
        kind: "not_deposited",
        severity: "info",
        ref: `Ca #${s.id}`,
        refId: s.id,
        at: s.closedAt,
        branchName: s.branch.name,
        amount: num(s.actualClosingBalance),
        detail: "Tiền mặt cuối ca chưa ghi vào quỹ",
      });
    }
  }

  const severityRank = { error: 0, warning: 1, info: 2 };
  issues.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0),
  );
  return {
    range: { from: input.from, to: input.to },
    summary: {
      invoices: invoices.length,
      matched,
      withIssues: invoices.length - matched,
      issues: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      sessions: sessions.length,
    },
    methods: [...methods.values()]
      .map((m) => ({
        ...m,
        label: METHOD_LABEL[m.method] ?? m.method,
        recorded: round2(m.recorded),
        confirmed: round2(m.confirmed),
        unverified: round2(m.unverified),
        source:
          m.method === "cash"
            ? "Kiểm tiền khi khoá ca"
            : (ELECTRONIC as readonly string[]).includes(m.method)
              ? "Payment Hub (tự động)"
              : "Đối chiếu sao kê ngân hàng",
      }))
      .sort((a, b) => b.recorded - a.recorded),
    issues: issues.slice(0, input.limit),
    issueTotal: issues.length,
    invoices: invoiceRows.slice(-input.limit).reverse(),
  };
}

// ─── Tổng quan ───────────────────────────────────────────────────────────────

export async function overview(input: PeriodInput, scope: BranchScope) {
  const [pnl, debts, funds] = await Promise.all([
    profitLoss(input, scope),
    debtTotals(),
    getPrisma().cashFund.findMany({
      where: { ...fundScopeWhere(scope, input.branchId), isActive: true },
      select: { type: true, balance: true },
    }),
  ]);
  const r = resolve(input, scope);
  const records = await getPrisma().revenueExpenseRecord.groupBy({
    by: ["type"],
    where: r.records,
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { type: "asc" },
  });
  const of = (t: "revenue" | "expense") => {
    const g = records.find((x) => x.type === t);
    return {
      amount: num(g?._sum.amount),
      count: typeof g?._count === "object" ? (g._count._all ?? 0) : 0,
    };
  };
  return {
    range: pnl.range,
    pnl: pnl.summary,
    series: pnl.series,
    receipts: of("revenue"),
    payments: of("expense"),
    funds: {
      cash: round2(funds.filter((f) => f.type === "cash").reduce((s, f) => s + num(f.balance), 0)),
      bank: round2(funds.filter((f) => f.type === "bank").reduce((s, f) => s + num(f.balance), 0)),
      count: funds.length,
    },
    debts,
  };
}
