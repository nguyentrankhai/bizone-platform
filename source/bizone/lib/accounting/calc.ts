/**
 * Pure accounting rules (no DB) — shared by the accounting services, the UI and unit tests.
 * Money is DECIMAL(15,2): every stored amount goes through round2.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type Direction = "in" | "out";
export type RecordType = "revenue" | "expense";

/** Fund direction of a receipt (phiếu thu → money in) / payment (phiếu chi → money out) */
export const directionOf = (type: RecordType): Direction => (type === "revenue" ? "in" : "out");

export const opposite = (d: Direction): Direction => (d === "in" ? "out" : "in");

/**
 * Balance after a movement. Throws RangeError when money out exceeds what the fund holds
 * (unless `allowNegative`, used for reversals the user cannot refuse).
 */
export function applyMovement(
  balance: number,
  direction: Direction,
  amount: number,
  allowNegative = false,
): number {
  if (!(amount > 0)) throw new RangeError("Số tiền phải lớn hơn 0");
  const after = round2(direction === "in" ? balance + amount : balance - amount);
  if (after < 0 && !allowNegative) {
    throw new RangeError(`Quỹ không đủ số dư (còn ${fmtVnd(balance)}, cần chi ${fmtVnd(amount)})`);
  }
  return after;
}

export function fmtVnd(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")}₫`;
}

/** Document prefix: PT = phiếu thu, PC = phiếu chi */
export const docPrefix = (type: RecordType) => (type === "revenue" ? "PT" : "PC");

/** "PT2611100001" = prefix + yymmdd (VN date) + 4-digit sequence of that day */
export function docCode(type: RecordType, dateKey: string, seq: number): string {
  const [y, m, d] = dateKey.split("-");
  return `${docPrefix(type)}${y.slice(2)}${m}${d}${String(seq).padStart(4, "0")}`;
}

/** Next sequence after the latest code of the same prefix + day (null = first of the day) */
export function nextSeq(lastCode: string | null | undefined, base: string): number {
  if (!lastCode || !lastCode.startsWith(base)) return 1;
  const n = Number(lastCode.slice(base.length));
  return Number.isFinite(n) ? n + 1 : 1;
}

/** A category may hold records of a type when it is of that type or 'both' */
export function categoryAccepts(categoryType: "revenue" | "expense" | "both", type: RecordType) {
  return categoryType === "both" || categoryType === type;
}

/**
 * Categories whose records are money movements already counted elsewhere in the P&L — kept in
 * the cash book and the cash-flow report but left out of revenue / expenses:
 *  - revenue_sales: shop sales — the P&L takes sales revenue from invoices
 *  - revenue_debt_collection: customer paying a debt — the sale was already revenue
 *  - expense_purchase: paying for goods — they become cost of goods sold when sold
 * Sub-categories inherit the rule.
 */
export const NON_PNL_CATEGORY_CODES = [
  "revenue_sales",
  "revenue_debt_collection",
  "expense_purchase",
] as const;

/** System categories created by the seed — their code and type cannot change, never deleted */
export const SYSTEM_CATEGORY_CODES = [
  "revenue_sales",
  "revenue_other",
  "revenue_debt_collection",
  "expense_purchase",
  "expense_rent",
  "expense_electricity",
  "expense_water",
  "expense_salary",
  "expense_shipping",
  "expense_marketing",
  "expense_other",
] as const;

export interface CategoryNode {
  id: number;
  parentId: number | null;
  code: string;
}

/** Category id → itself + every descendant */
export function subtreeIds(all: CategoryNode[], rootId: number): number[] {
  const children = new Map<number, number[]>();
  for (const c of all) {
    if (c.parentId === null) continue;
    children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Ids of the categories left out of the P&L (see NON_PNL_CATEGORY_CODES) */
export function nonPnlCategoryIds(all: CategoryNode[]): Set<number> {
  const out = new Set<number>();
  for (const c of all) {
    if ((NON_PNL_CATEGORY_CODES as readonly string[]).includes(c.code)) {
      for (const id of subtreeIds(all, c.id)) out.add(id);
    }
  }
  return out;
}

/** Moving `id` under `newParentId` would create a cycle */
export function wouldCycle(all: CategoryNode[], id: number, newParentId: number | null): boolean {
  if (newParentId === null) return false;
  return subtreeIds(all, id).includes(newParentId);
}

// ─── Debts ───────────────────────────────────────────────────────────────────

export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

const DAY_MS = 86_400_000;

/** Days past due on `today` (both YYYY-MM-DD); ≤ 0 = not overdue, null due date = never */
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / DAY_MS,
  );
}

export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  const d = daysOverdue(dueDate, today);
  if (d <= 0) return "current";
  if (d <= 30) return "d1_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "d90_plus";
}

export type Aging = Record<AgingBucket, number>;

export const emptyAging = (): Aging => ({
  current: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_plus: 0,
});

// ─── Profit & loss ───────────────────────────────────────────────────────────

export interface PnlInput {
  /** Net sales of invoices (after discounts and returns) */
  netSales: number;
  /** Cost of goods sold */
  cogs: number;
  /** Other income records (categories counted in the P&L) */
  otherIncome: number;
  /** Operating expense records (categories counted in the P&L) */
  expenses: number;
}

export interface Pnl extends PnlInput {
  grossProfit: number;
  /** Doanh thu = net sales + other income */
  revenue: number;
  /** Chi phí = cost of goods sold + operating expenses */
  totalCost: number;
  netProfit: number;
  netMargin: number | null;
}

/** Lời lỗ: (doanh thu bán hàng + thu khác) − (giá vốn + chi phí) */
export function profitAndLoss(i: PnlInput): Pnl {
  const grossProfit = round2(i.netSales - i.cogs);
  const revenue = round2(i.netSales + i.otherIncome);
  const totalCost = round2(i.cogs + i.expenses);
  const netProfit = round2(revenue - totalCost);
  return {
    ...i,
    grossProfit,
    revenue,
    totalCost,
    netProfit,
    netMargin: revenue ? Math.round((netProfit / revenue) * 1000) / 10 : null,
  };
}
