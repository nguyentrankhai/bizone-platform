import { Prisma } from "@/generated/prisma/client";
import { bizoneError, notFound } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { vnDateKeyRange, vnMonthRange } from "@/lib/vn-time";
import type { CommissionRuleInput } from "@/lib/validators/staff";

/**
 * Commissions are derived data: for one seller and one VN month, `recalculateMonth` rebuilds
 * the `pending` rows from the seller's invoices (`invoices.user_id`) and the active rules.
 * It runs after every sale / cancel / refund (queue `bizone-commission`) and once more at the
 * start of the next month to settle `min_revenue` thresholds. Paid rows are never touched.
 *
 * Revenue of an item = its line total × (invoice total / Σ line totals) — the same ratio the
 * POS uses to price refunds, so invoice-level discounts are shared out — minus completed
 * refunds; profit = revenue − cost_price × kept quantity (items without cost are
 * skipped by profit rules). Category rules include sub-categories.
 */

export type RuleType = "percent_revenue" | "percent_profit" | "fixed_per_product";

export interface CalcRule {
  id: number;
  type: RuleType;
  value: number;
  productId: number | null;
  categoryId: number | null;
  minRevenue: number | null;
}

export interface CalcItem {
  productId: number;
  categoryId: number | null;
  quantity: number;
  refundedQuantity: number;
  lineTotal: number;
  refundedAmount: number;
  costPrice: number | null;
}

export interface CalcInvoice {
  id: number;
  /** invoice total / Σ line totals (invoice-level discount share) */
  ratio: number;
  items: CalcItem[];
}

export interface CalcLine {
  invoiceId: number;
  ruleId: number;
  amount: number;
}

/** Net revenue and profit contributed by one invoice item */
export function itemNet(inv: CalcInvoice, item: CalcItem) {
  const keptQty = Math.max(0, item.quantity - item.refundedQuantity);
  const revenue = Math.max(0, item.lineTotal * inv.ratio - item.refundedAmount);
  const profit = item.costPrice === null ? null : revenue - item.costPrice * keptQty;
  return { keptQty, revenue, profit };
}

function ruleMatches(rule: CalcRule, item: CalcItem, categoryScope: Map<number, Set<number>>) {
  if (rule.productId !== null && item.productId !== rule.productId) return false;
  if (rule.categoryId !== null) {
    const scope = categoryScope.get(rule.categoryId);
    if (item.categoryId === null || !scope?.has(item.categoryId)) return false;
  }
  return true;
}

/**
 * Pure commission calculation for one seller-month. `categoryScope` maps a rule's category id
 * to itself + all descendants. Amounts are rounded to whole đồng; zero lines are dropped.
 */
export function calculateCommissions(
  invoices: CalcInvoice[],
  rules: CalcRule[],
  categoryScope: Map<number, Set<number>>,
): { monthRevenue: number; lines: CalcLine[] } {
  const monthRevenue = invoices.reduce(
    (sum, inv) => sum + inv.items.reduce((s, it) => s + itemNet(inv, it).revenue, 0),
    0,
  );
  const lines: CalcLine[] = [];
  for (const rule of rules) {
    if (rule.minRevenue !== null && monthRevenue < rule.minRevenue) continue;
    for (const inv of invoices) {
      let amount = 0;
      for (const item of inv.items) {
        if (!ruleMatches(rule, item, categoryScope)) continue;
        const { keptQty, revenue, profit } = itemNet(inv, item);
        if (rule.type === "percent_revenue") amount += (revenue * rule.value) / 100;
        else if (rule.type === "percent_profit") amount += ((profit ?? 0) * rule.value) / 100;
        else amount += keptQty * rule.value;
      }
      const rounded = Math.round(Math.max(0, amount));
      if (rounded > 0) lines.push({ invoiceId: inv.id, ruleId: rule.id, amount: rounded });
    }
  }
  return { monthRevenue: Math.round(monthRevenue), lines };
}

/** category id → itself + descendants */
export function buildCategoryScope(
  categories: { id: number; parentId: number | null }[],
  roots: number[],
): Map<number, Set<number>> {
  const children = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parentId !== null) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const out = new Map<number, Set<number>>();
  for (const root of roots) {
    const seen = new Set<number>([root]);
    const stack = [root];
    while (stack.length) {
      for (const child of children.get(stack.pop()!) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          stack.push(child);
        }
      }
    }
    out.set(root, seen);
  }
  return out;
}

const num = (d: Prisma.Decimal | number | null | undefined) =>
  d === null || d === undefined ? 0 : Number(d);

async function loadSellerMonth(userId: number, month: string) {
  const prisma = getPrisma();
  const { start, end } = vnMonthRange(month);
  const invoices = await prisma.invoice.findMany({
    where: { userId, createdAt: { gte: start, lt: end }, status: { in: ["active", "refunded"] } },
    select: {
      id: true,
      totalAmount: true,
      invoiceItems: {
        select: {
          productId: true,
          quantity: true,
          totalAmount: true,
          costPrice: true,
          product: { select: { categoryId: true } },
          invoiceRefundItems: {
            where: { refund: { status: "completed" } },
            select: { quantity: true, refundAmount: true },
          },
        },
      },
    },
  });
  return invoices.map<CalcInvoice>((inv) => {
    const itemsTotal = inv.invoiceItems.reduce((s, it) => s + num(it.totalAmount), 0);
    return {
      id: inv.id,
      ratio: itemsTotal > 0 ? num(inv.totalAmount) / itemsTotal : 0,
      items: inv.invoiceItems.map((it) => ({
        productId: it.productId,
        categoryId: it.product.categoryId,
        quantity: num(it.quantity),
        refundedQuantity: it.invoiceRefundItems.reduce((s, r) => s + num(r.quantity), 0),
        lineTotal: num(it.totalAmount),
        refundedAmount: it.invoiceRefundItems.reduce((s, r) => s + num(r.refundAmount), 0),
        costPrice: it.costPrice === null ? null : num(it.costPrice),
      })),
    };
  });
}

async function activeRules(): Promise<{ rules: CalcRule[]; scope: Map<number, Set<number>> }> {
  const prisma = getPrisma();
  const rows = await prisma.commissionRule.findMany({ where: { isActive: true } });
  const rules = rows.map<CalcRule>((r) => ({
    id: r.id,
    type: r.type,
    value: num(r.value),
    productId: r.productId,
    categoryId: r.categoryId,
    minRevenue: r.minRevenue === null ? null : num(r.minRevenue),
  }));
  const roots = [...new Set(rules.map((r) => r.categoryId).filter((v): v is number => v !== null))];
  const categories = roots.length
    ? await prisma.productCategory.findMany({ select: { id: true, parentId: true } })
    : [];
  return { rules, scope: buildCategoryScope(categories, roots) };
}

/**
 * Rebuild pending commissions of one seller for one VN month. Idempotent: rows already paid
 * are kept as-is (and their invoice+rule is not recomputed), pending rows are updated,
 * deleted or created to match the calculation.
 */
export async function recalculateMonth(userId: number, month: string) {
  const prisma = getPrisma();
  const [invoices, { rules, scope }] = await Promise.all([
    loadSellerMonth(userId, month),
    activeRules(),
  ]);
  const { monthRevenue, lines } = calculateCommissions(invoices, rules, scope);
  const { start, end } = vnMonthRange(month);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.commission.findMany({
      where: {
        userId,
        invoice: { createdAt: { gte: start, lt: end } },
        status: { in: ["pending", "paid"] },
      },
      select: { id: true, invoiceId: true, commissionRuleId: true, amount: true, status: true },
    });
    const k = (invoiceId: number | null, ruleId: number | null) => `${invoiceId}:${ruleId}`;
    const paid = new Set(
      existing.filter((e) => e.status === "paid").map((e) => k(e.invoiceId, e.commissionRuleId)),
    );
    const pending = new Map(
      existing
        .filter((e) => e.status === "pending")
        .map((e) => [k(e.invoiceId, e.commissionRuleId), e]),
    );
    let created = 0;
    let updated = 0;
    for (const line of lines) {
      const key = k(line.invoiceId, line.ruleId);
      if (paid.has(key)) continue;
      const row = pending.get(key);
      if (row) {
        pending.delete(key);
        if (num(row.amount) !== line.amount) {
          await tx.commission.update({ where: { id: row.id }, data: { amount: line.amount } });
          updated++;
        }
      } else {
        await tx.commission.create({
          data: {
            userId,
            invoiceId: line.invoiceId,
            commissionRuleId: line.ruleId,
            amount: line.amount,
          },
        });
        created++;
      }
    }
    const stale = [...pending.values()].map((r) => r.id);
    if (stale.length) await tx.commission.deleteMany({ where: { id: { in: stale } } });
    return { userId, month, monthRevenue, created, updated, removed: stale.length };
  });
}

/** Sellers with invoices (or pending commissions) in the month — for month-end settlement */
export async function sellersOfMonth(month: string): Promise<number[]> {
  const prisma = getPrisma();
  const { start, end } = vnMonthRange(month);
  const [inv, comm] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: start, lt: end } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.commission.findMany({
      where: { status: "pending", invoice: { createdAt: { gte: start, lt: end } } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  return [...new Set([...inv.map((r) => r.userId), ...comm.map((r) => r.userId)])];
}

export async function recalculateAll(month: string, userId?: number) {
  const users = userId ? [userId] : await sellersOfMonth(month);
  const results = [];
  for (const id of users) results.push(await recalculateMonth(id, month));
  return {
    month,
    users: results.length,
    created: results.reduce((s, r) => s + r.created, 0),
    updated: results.reduce((s, r) => s + r.updated, 0),
    removed: results.reduce((s, r) => s + r.removed, 0),
  };
}

// ─── Rules ────────────────────────────────────────────────────────────────────

const ruleSelect = {
  id: true,
  name: true,
  type: true,
  value: true,
  productId: true,
  categoryId: true,
  minRevenue: true,
  isActive: true,
  createdAt: true,
  product: { select: { id: true, name: true, sku: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.CommissionRuleSelect;

export async function listRules() {
  return getPrisma().commissionRule.findMany({
    select: ruleSelect,
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
  });
}

async function checkTargets(productId?: number | null, categoryId?: number | null) {
  const prisma = getPrisma();
  if (productId && categoryId) {
    throw bizoneError("VALIDATION_ERROR", "Chọn sản phẩm HOẶC danh mục, không chọn cả hai");
  }
  if (
    productId &&
    !(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))
  ) {
    throw bizoneError("VALIDATION_ERROR", "Sản phẩm không tồn tại");
  }
  if (
    categoryId &&
    !(await prisma.productCategory.findUnique({ where: { id: categoryId }, select: { id: true } }))
  ) {
    throw bizoneError("VALIDATION_ERROR", "Danh mục không tồn tại");
  }
}

export async function createRule(input: CommissionRuleInput) {
  await checkTargets(input.productId, input.categoryId);
  return getPrisma().commissionRule.create({
    data: {
      name: input.name,
      type: input.type,
      value: input.value,
      productId: input.productId ?? null,
      categoryId: input.categoryId ?? null,
      minRevenue: input.minRevenue ?? null,
      isActive: input.isActive,
    },
    select: ruleSelect,
  });
}

export async function updateRule(input: Partial<CommissionRuleInput> & { id: number }) {
  const prisma = getPrisma();
  const current = await prisma.commissionRule.findUnique({ where: { id: input.id } });
  if (!current) throw notFound("Quy tắc hoa hồng", input.id);
  const productId = input.productId !== undefined ? input.productId : current.productId;
  const categoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId;
  await checkTargets(productId, categoryId);
  const type = input.type ?? current.type;
  const value = input.value ?? num(current.value);
  if (type !== "fixed_per_product" && value > 100) {
    throw bizoneError("VALIDATION_ERROR", "Tỷ lệ % phải ≤ 100");
  }
  return prisma.commissionRule.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      type,
      value,
      productId,
      categoryId,
      ...(input.minRevenue !== undefined ? { minRevenue: input.minRevenue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: ruleSelect,
  });
}

// ─── Commissions ──────────────────────────────────────────────────────────────

export async function listCommissions(input: {
  month: string;
  userId?: number;
  /** QA-3 (#96): staff of the caller's branches */
  userIds?: number[];
  status?: "pending" | "paid" | "cancelled";
  page: number;
  pageSize: number;
}) {
  const prisma = getPrisma();
  const { start, end } = vnMonthRange(input.month);
  const where: Prisma.CommissionWhereInput = {
    invoice: { createdAt: { gte: start, lt: end } },
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.userIds ? { AND: [{ userId: { in: input.userIds } }] } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total, byUser] = await Promise.all([
    prisma.commission.findMany({
      where,
      select: {
        id: true,
        amount: true,
        status: true,
        paidAt: true,
        createdAt: true,
        user: { select: { id: true, fullName: true } },
        invoice: { select: { id: true, invoiceCode: true, totalAmount: true, createdAt: true } },
        commissionRule: { select: { id: true, name: true, type: true, value: true } },
      },
      orderBy: { id: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.commission.count({ where }),
    prisma.commission.groupBy({
      by: ["userId", "status"],
      where: {
        invoice: { createdAt: { gte: start, lt: end } },
        ...(input.userId ? { userId: input.userId } : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(byUser.map((r) => r.userId))] } },
    select: { id: true, fullName: true },
  });
  const summary = users.map((u) => {
    const rows = byUser.filter((r) => r.userId === u.id);
    const sum = (s: string) => num(rows.find((r) => r.status === s)?._sum.amount);
    return {
      user: u,
      pending: sum("pending"),
      paid: sum("paid"),
      count: rows.reduce((s, r) => s + r._count._all, 0),
    };
  });
  return {
    items,
    summary,
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function payCommissions(input: { ids?: number[]; userId?: number; month?: string }) {
  const prisma = getPrisma();
  let where: Prisma.CommissionWhereInput;
  if (input.ids?.length) {
    where = { id: { in: input.ids }, status: "pending" };
  } else {
    const { start, end } = vnMonthRange(input.month!);
    where = {
      userId: input.userId,
      status: "pending",
      invoice: { createdAt: { gte: start, lt: end } },
    };
  }
  const candidates = await prisma.commission.findMany({ where, select: { id: true } });
  if (candidates.length === 0) throw bizoneError("CONFLICT", "Không có hoa hồng chờ thanh toán");
  // QA-3 (#99): lock the rows still pending so the reported total is exactly what this call paid
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: number; amount: unknown }[]>`
      SELECT id, amount FROM commissions
      WHERE id IN (${Prisma.join(candidates.map((c) => c.id))}) AND status = 'pending'
      FOR UPDATE`;
    if (rows.length === 0) throw bizoneError("CONFLICT", "Hoa hồng vừa được thanh toán");
    const ids = rows.map((r) => Number(r.id));
    const result = await tx.commission.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "paid", paidAt: new Date() },
    });
    return {
      count: result.count,
      amount: rows.reduce((s, r) => s + num(r.amount as number), 0),
      ids,
    };
  });
}

// ─── Sales performance ────────────────────────────────────────────────────────

/** Revenue / invoice count / average per seller for VN dates from..to (POS invoices, net of refunds) */
export async function staffSales(input: {
  from: string;
  to: string;
  userId?: number;
  /** QA-3 (#96): staff of the caller's branches */
  userIds?: number[];
}) {
  const prisma = getPrisma();
  const { start, end } = vnDateKeyRange(input.from, input.to);
  if (start >= end) throw bizoneError("VALIDATION_ERROR", "Khoảng ngày không hợp lệ");
  const where: Prisma.InvoiceWhereInput = {
    createdAt: { gte: start, lt: end },
    status: { in: ["active", "refunded"] },
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.userIds ? { AND: [{ userId: { in: input.userIds } }] } : {}),
  };
  const [grouped, refunds] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["userId"],
      where,
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.invoiceRefund.findMany({
      where: { status: "completed", invoice: where },
      select: { totalRefundAmount: true, invoice: { select: { userId: true } } },
    }),
  ]);
  const refundBy = new Map<number, number>();
  for (const r of refunds) {
    refundBy.set(
      r.invoice.userId,
      (refundBy.get(r.invoice.userId) ?? 0) + num(r.totalRefundAmount),
    );
  }
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, fullName: true, username: true },
  });
  const rows = grouped
    .map((g) => {
      const revenue = num(g._sum.totalAmount) - (refundBy.get(g.userId) ?? 0);
      const invoices = g._count._all;
      return {
        user: users.find((u) => u.id === g.userId) ?? {
          id: g.userId,
          fullName: "?",
          username: "?",
        },
        revenue,
        invoices,
        avgPerInvoice: invoices ? Math.round(revenue / invoices) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  let topProducts: { productId: number; name: string; quantity: number; revenue: number }[] = [];
  if (input.userId) {
    const items = await prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: { invoice: where },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 10,
    });
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: { id: true, name: true },
    });
    topProducts = items.map((i) => ({
      productId: i.productId,
      name: products.find((p) => p.id === i.productId)?.name ?? `#${i.productId}`,
      quantity: num(i._sum.quantity),
      revenue: num(i._sum.totalAmount),
    }));
  }
  return { from: input.from, to: input.to, rows, topProducts };
}
