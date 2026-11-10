import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { dateKeysBetween, vnDateKey, vnDateKeyRange } from "@/lib/vn-time";
import type {
  InventoryReportInput,
  PromotionReportInput,
  ReportFilter,
} from "@/lib/validators/report";
import { buildCategoryScope } from "./commission.service";

/**
 * Sales reports from POS invoices (status active / refunded; cancelled excluded), VN dates.
 * Every figure is computed per invoice line, so the category filter stays exact:
 *  - gross     = line total (after line discounts)
 *  - discount  = invoice-level discount shared over lines (line × (1 − invoice total / Σ lines))
 *  - refunds   = completed refunds of the line (attributed to the invoice date)
 *  - net       = gross − discount − refunds   ("doanh thu thuần")
 *  - cost      = cost price at sale (fallback: product cost) × quantity kept
 *  - profit    = net − cost
 * Online orders (module Đơn hàng) are not included yet — same scope as the dashboard.
 */

const DAY_MS = 86_400_000;

// ─── Periods ─────────────────────────────────────────────────────────────────

export function shiftDateKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function minusYear(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate(); // 29 Feb → 28 Feb
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function periodLength(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

/** Period to compare with: the equally long period right before, or the same dates last year */
export function comparisonRange(
  from: string,
  to: string,
  mode: ReportFilter["compare"],
): { from: string; to: string } | null {
  if (mode === "none") return null;
  if (mode === "previous_year") return { from: minusYear(from), to: minusYear(to) };
  const n = periodLength(from, to);
  return { from: shiftDateKey(from, -n), to: shiftDateKey(from, -1) };
}

/** Day buckets up to 62 days, month buckets beyond */
export function bucketsOf(from: string, to: string): { unit: "day" | "month"; keys: string[] } {
  const days = dateKeysBetween(from, to);
  if (days.length <= 62) return { unit: "day", keys: days };
  return { unit: "month", keys: [...new Set(days.map((d) => d.slice(0, 7)))] };
}

/** Relative change in % (null when the base is 0) */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ─── Line-level SQL ──────────────────────────────────────────────────────────

interface Scope {
  from: string;
  to: string;
  branchId?: number;
  /** P4.6: several branches (aggregate report of a multi-branch user) */
  branchIds?: number[];
  userId?: number;
  categoryIds?: number[];
}

async function categoryIdsOf(categoryId?: number): Promise<number[] | undefined> {
  if (!categoryId) return undefined;
  const all = await getPrisma().productCategory.findMany({ select: { id: true, parentId: true } });
  return [...(buildCategoryScope(all, [categoryId]).get(categoryId) ?? [categoryId])];
}

/** One row per invoice line with the money columns described at the top of the file */
function linesSql(s: Scope): Prisma.Sql {
  const { start, end } = vnDateKeyRange(s.from, s.to);
  const filters: Prisma.Sql[] = [
    Prisma.sql`i.created_at >= ${start}`,
    Prisma.sql`i.created_at < ${end}`,
    Prisma.sql`i.status IN ('active', 'refunded')`,
  ];
  if (s.branchId) filters.push(Prisma.sql`i.branch_id = ${s.branchId}`);
  if (s.branchIds)
    filters.push(
      s.branchIds.length
        ? Prisma.sql`i.branch_id IN (${Prisma.join(s.branchIds)})`
        : Prisma.sql`FALSE`,
    );
  if (s.userId) filters.push(Prisma.sql`i.user_id = ${s.userId}`);
  if (s.categoryIds) {
    filters.push(
      s.categoryIds.length
        ? Prisma.sql`p.category_id IN (${Prisma.join(s.categoryIds)})`
        : Prisma.sql`FALSE`,
    );
  }
  return Prisma.sql`
    SELECT i.id AS invoice_id, i.user_id, i.branch_id,
      DATE(i.created_at + INTERVAL 7 HOUR) AS d,
      ii.product_id, p.category_id,
      ii.quantity - COALESCE(r.rq, 0) AS qty,
      ii.total_amount AS gross,
      ii.total_amount - CASE WHEN t.items_total > 0
        THEN ii.total_amount * i.total_amount / t.items_total ELSE 0 END AS discount,
      COALESCE(r.ra, 0) AS refunds,
      COALESCE(ii.cost_price, p.cost_price, 0) * (ii.quantity - COALESCE(r.rq, 0)) AS cost,
      (ii.cost_price IS NULL AND COALESCE(p.cost_price, 0) = 0) AS no_cost
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_id = i.id
    JOIN products p ON p.id = ii.product_id
    JOIN (
      SELECT x.invoice_id, SUM(x.total_amount) AS items_total
      FROM invoice_items x JOIN invoices xi ON xi.id = x.invoice_id
      WHERE xi.created_at >= ${start} AND xi.created_at < ${end}
      GROUP BY x.invoice_id
    ) t ON t.invoice_id = i.id
    LEFT JOIN (
      SELECT iri.invoice_item_id, SUM(iri.quantity) AS rq, SUM(iri.refund_amount) AS ra
      FROM invoice_refund_items iri
      JOIN invoice_refunds ir ON ir.id = iri.refund_id AND ir.status = 'completed'
      JOIN invoices ri ON ri.id = ir.invoice_id
      WHERE ri.created_at >= ${start} AND ri.created_at < ${end}
      GROUP BY iri.invoice_item_id
    ) r ON r.invoice_item_id = ii.id
    WHERE ${Prisma.join(filters, " AND ")}`;
}

const AGG = Prisma.sql`
  COALESCE(SUM(l.gross), 0) AS gross,
  COALESCE(SUM(l.discount), 0) AS discount,
  COALESCE(SUM(l.refunds), 0) AS refunds,
  COALESCE(SUM(l.gross - l.discount - l.refunds), 0) AS net,
  COALESCE(SUM(l.cost), 0) AS cost,
  COALESCE(SUM(l.qty), 0) AS qty,
  COUNT(DISTINCT l.invoice_id) AS invoices,
  COALESCE(SUM(l.no_cost), 0) AS no_cost_lines`;

type RawAgg = Record<string, unknown>;

export interface Totals {
  gross: number;
  discount: number;
  refunds: number;
  net: number;
  cost: number;
  profit: number;
  margin: number | null;
  qty: number;
  invoices: number;
  avgPerInvoice: number;
  noCostLines: number;
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const money = (v: number) => Math.round(v);

export function toTotals(r: RawAgg | undefined): Totals {
  const net = n(r?.net);
  const cost = n(r?.cost);
  const invoices = n(r?.invoices);
  return {
    gross: money(n(r?.gross)),
    discount: money(n(r?.discount)),
    refunds: money(n(r?.refunds)),
    net: money(net),
    cost: money(cost),
    profit: money(net - cost),
    margin: net ? Math.round(((net - cost) / net) * 1000) / 10 : null,
    qty: n(r?.qty),
    invoices,
    avgPerInvoice: invoices ? money(net / invoices) : 0,
    noCostLines: n(r?.no_cost_lines),
  };
}

async function totals(s: Scope): Promise<Totals> {
  const rows = await getPrisma().$queryRaw<RawAgg[]>`SELECT ${AGG} FROM (${linesSql(s)}) l`;
  return toTotals(rows[0]);
}

async function grouped(
  s: Scope,
  by: "d" | "month" | "category_id" | "product_id" | "user_id" | "branch_id",
) {
  const key =
    by === "month"
      ? Prisma.sql`DATE_FORMAT(l.d, '%Y-%m')`
      : by === "d"
        ? Prisma.sql`DATE_FORMAT(l.d, '%Y-%m-%d')`
        : Prisma.raw(`l.${by}`);
  const rows = await getPrisma().$queryRaw<RawAgg[]>`
    SELECT ${key} AS k, ${AGG} FROM (${linesSql(s)}) l GROUP BY k`;
  return new Map(rows.map((r) => [r.k === null ? "null" : String(r.k), toTotals(r)]));
}

async function scopes(f: ReportFilter) {
  const categoryIds = await categoryIdsOf(f.categoryId);
  const base = { branchId: f.branchId, userId: f.userId, categoryIds };
  const cmp = comparisonRange(f.from, f.to, f.compare);
  return {
    current: { ...base, from: f.from, to: f.to } as Scope,
    compare: cmp ? ({ ...base, ...cmp } as Scope) : null,
    compareRange: cmp,
  };
}

async function series(s: Scope, compare: Scope | null) {
  const cur = bucketsOf(s.from, s.to);
  const by = cur.unit === "day" ? "d" : "month";
  const [curMap, cmpMap] = await Promise.all([
    grouped(s, by),
    compare ? grouped(compare, by) : Promise.resolve(null),
  ]);
  const cmpKeys = compare ? bucketsOf(compare.from, compare.to).keys : [];
  return {
    unit: cur.unit,
    points: cur.keys.map((key, i) => {
      const t = curMap.get(key) ?? toTotals(undefined);
      const c = cmpMap ? (cmpMap.get(cmpKeys[i] ?? "") ?? toTotals(undefined)) : null;
      return {
        key,
        ...t,
        compareKey: cmpKeys[i] ?? null,
        compareNet: c?.net ?? null,
        compareProfit: c?.profit ?? null,
        change: c ? changePct(t.net, c.net) : null,
      };
    }),
  };
}

function withChange(current: Totals, previous: Totals | null) {
  return {
    current,
    previous,
    change: previous
      ? {
          net: changePct(current.net, previous.net),
          gross: changePct(current.gross, previous.gross),
          discount: changePct(current.discount, previous.discount),
          invoices: changePct(current.invoices, previous.invoices),
          profit: changePct(current.profit, previous.profit),
          margin:
            current.margin !== null && previous.margin !== null
              ? Math.round((current.margin - previous.margin) * 10) / 10
              : null,
        }
      : null,
  };
}

async function categoryNames(ids: string[]) {
  const nums = ids.filter((k) => k !== "null").map(Number);
  const rows = await getPrisma().productCategory.findMany({
    where: { id: { in: nums } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [String(r.id), r.name]));
}

// ─── Reports ─────────────────────────────────────────────────────────────────

/** Net cash = cash received − change given (same rule as the dashboard) */
async function paymentMethods(s: Scope) {
  const { start, end } = vnDateKeyRange(s.from, s.to);
  const rows = await getPrisma().$queryRaw<{ method: string; amount: unknown }[]>`
    SELECT ip.payment_method AS method, SUM(ip.amount) AS amount
    FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id
    WHERE i.created_at >= ${start} AND i.created_at < ${end}
      AND i.status IN ('active', 'refunded')
      ${s.branchId ? Prisma.sql`AND i.branch_id = ${s.branchId}` : Prisma.empty}
      ${s.userId ? Prisma.sql`AND i.user_id = ${s.userId}` : Prisma.empty}
    GROUP BY ip.payment_method`;
  const change = await getPrisma().$queryRaw<{ change: unknown }[]>`
    SELECT COALESCE(SUM(i.change_amount), 0) AS \`change\` FROM invoices i
    WHERE i.created_at >= ${start} AND i.created_at < ${end}
      AND i.status IN ('active', 'refunded')
      ${s.branchId ? Prisma.sql`AND i.branch_id = ${s.branchId}` : Prisma.empty}
      ${s.userId ? Prisma.sql`AND i.user_id = ${s.userId}` : Prisma.empty}`;
  const items = rows.map((r) => ({
    method: r.method,
    amount: money(n(r.amount) - (r.method === "cash" ? n(change[0]?.change) : 0)),
  }));
  const total = items.reduce((a, b) => a + b.amount, 0);
  return items
    .map((i) => ({ ...i, percent: total ? Math.round((i.amount / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export async function revenueReport(f: ReportFilter) {
  const { current, compare, compareRange } = await scopes(f);
  const [cur, prev, chart, byCat, methods] = await Promise.all([
    totals(current),
    compare ? totals(compare) : Promise.resolve(null),
    series(current, compare),
    grouped(current, "category_id"),
    // invoice payments cannot be split by category
    f.categoryId ? Promise.resolve(null) : paymentMethods(current),
  ]);
  const names = await categoryNames([...byCat.keys()]);
  return {
    range: { from: f.from, to: f.to },
    compareRange,
    summary: withChange(cur, prev),
    series: chart,
    paymentMethods: methods,
    byCategory: [...byCat.entries()]
      .map(([k, t]) => ({
        categoryId: k === "null" ? null : Number(k),
        name: names.get(k) ?? "Chưa phân loại",
        ...t,
      }))
      .sort((a, b) => b.net - a.net),
  };
}

/**
 * Báo cáo tổng hợp theo chi nhánh (P4.6): doanh thu thuần, lợi nhuận, số HĐ… của từng chi nhánh
 * và toàn bộ, so với kỳ trước. `branchIds` = chi nhánh người dùng được xem (null = tất cả).
 */
export async function branchReport(f: ReportFilter, branchIds: number[] | null) {
  const { current, compare, compareRange } = await scopes({ ...f, branchId: undefined });
  const only = branchIds ?? undefined;
  const cur = { ...current, branchIds: only };
  const cmp = compare ? { ...compare, branchIds: only } : null;
  const [byBranch, prevByBranch, total, prevTotal] = await Promise.all([
    grouped(cur, "branch_id"),
    cmp ? grouped(cmp, "branch_id") : Promise.resolve(null),
    totals(cur),
    cmp ? totals(cmp) : Promise.resolve(null),
  ]);
  const branches = await getPrisma().branch.findMany({
    where: only ? { id: { in: only } } : {},
    select: { id: true, code: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  const rows = branches
    .map((b) => {
      const t = byBranch.get(String(b.id)) ?? toTotals(undefined);
      const p = prevByBranch?.get(String(b.id)) ?? null;
      return {
        branchId: b.id,
        code: b.code,
        name: b.name,
        status: b.status,
        ...t,
        share: total.net ? Math.round((t.net / total.net) * 1000) / 10 : 0,
        previousNet: p ? p.net : null,
        netChange: p ? changePct(t.net, p.net) : null,
      };
    })
    // inactive branches only when they sold something in the period
    .filter((r) => r.status === "active" || r.invoices > 0)
    .sort((a, b) => b.net - a.net);
  return {
    range: { from: f.from, to: f.to },
    compareRange,
    summary: withChange(total, prevTotal),
    branches: rows,
  };
}

export async function profitReport(f: ReportFilter) {
  const { current, compare, compareRange } = await scopes(f);
  const [cur, prev, chart, byCat, byProduct] = await Promise.all([
    totals(current),
    compare ? totals(compare) : Promise.resolve(null),
    series(current, compare),
    grouped(current, "category_id"),
    grouped(current, "product_id"),
  ]);
  const productIds = [...byProduct.keys()].map(Number);
  const [names, products] = await Promise.all([
    categoryNames([...byCat.keys()]),
    getPrisma().product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    }),
  ]);
  const productRows = [...byProduct.entries()].map(([k, t]) => {
    const p = products.find((x) => x.id === Number(k));
    return { productId: Number(k), name: p?.name ?? `#${k}`, sku: p?.sku ?? "", ...t };
  });
  return {
    range: { from: f.from, to: f.to },
    compareRange,
    summary: withChange(cur, prev),
    series: chart,
    byCategory: [...byCat.entries()]
      .map(([k, t]) => ({
        categoryId: k === "null" ? null : Number(k),
        name: names.get(k) ?? "Chưa phân loại",
        ...t,
      }))
      .sort((a, b) => b.profit - a.profit),
    topProfit: [...productRows].sort((a, b) => b.profit - a.profit).slice(0, 10),
    lowProfit: [...productRows].sort((a, b) => a.profit - b.profit).slice(0, 10),
  };
}

export async function productReport(f: ReportFilter) {
  const { current } = await scopes(f);
  const byProduct = await grouped(current, "product_id");
  const sold = [...byProduct.entries()].map(([k, t]) => ({ productId: Number(k), ...t }));
  const best = [...sold].sort((a, b) => b.qty - a.qty || b.net - a.net).slice(0, 10);

  // Slow movers: in stock (filtered branch's warehouses) and sold least in the period
  const prisma = getPrisma();
  const stock = await prisma.inventory.groupBy({
    by: ["productId"],
    where: {
      quantity: { gt: 0 },
      ...(f.branchId ? { warehouse: { branchId: f.branchId } } : {}),
      ...(current.categoryIds ? { product: { categoryId: { in: current.categoryIds } } } : {}),
    },
    _sum: { quantity: true },
  });
  const soldQty = new Map(sold.map((s) => [s.productId, s.qty]));
  const slowIds = stock
    .map((s) => ({
      productId: s.productId,
      stock: n(s._sum.quantity),
      qty: soldQty.get(s.productId) ?? 0,
    }))
    .sort((a, b) => a.qty - b.qty || b.stock - a.stock)
    .slice(0, 10);

  const ids = [...new Set([...best.map((b) => b.productId), ...slowIds.map((s) => s.productId)])];
  const [products, lastSales] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: slowIds.map((s) => s.productId) },
        invoice: { status: { in: ["active", "refunded"] } },
      },
      _max: { createdAt: true },
    }),
  ]);
  const info = (id: number) => products.find((p) => p.id === id);
  const today = vnDateKey(new Date());
  return {
    range: { from: f.from, to: f.to },
    bestSelling: best.map((b) => ({
      ...b,
      name: info(b.productId)?.name ?? `#${b.productId}`,
      sku: info(b.productId)?.sku ?? "",
    })),
    slowMoving: slowIds.map((s) => {
      const last = lastSales.find((l) => l.productId === s.productId)?._max.createdAt ?? null;
      const p = info(s.productId);
      return {
        ...s,
        name: p?.name ?? `#${s.productId}`,
        sku: p?.sku ?? "",
        stockValue: money(s.stock * n(p?.costPrice)),
        lastSoldAt: last,
        daysSinceSale: last ? periodLength(vnDateKey(last), today) - 1 : null,
      };
    }),
  };
}

export async function staffReport(f: ReportFilter) {
  const { current, compare, compareRange } = await scopes(f);
  const [byUser, prevByUser] = await Promise.all([
    grouped(current, "user_id"),
    compare ? grouped(compare, "user_id") : Promise.resolve(null),
  ]);
  const ids = [...new Set([...byUser.keys(), ...(prevByUser?.keys() ?? [])])].map(Number);
  const users = await getPrisma().user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, username: true, isActive: true },
  });
  const rows = ids.map((id) => {
    const t = byUser.get(String(id)) ?? toTotals(undefined);
    const p = prevByUser?.get(String(id)) ?? null;
    const u = users.find((x) => x.id === id);
    return {
      userId: id,
      fullName: u?.fullName ?? `#${id}`,
      username: u?.username ?? "",
      isActive: u?.isActive ?? false,
      ...t,
      previousNet: p?.net ?? (prevByUser ? 0 : null),
      change: prevByUser ? changePct(t.net, p?.net ?? 0) : null,
    };
  });
  const total = rows.reduce((s, r) => s + r.net, 0);
  return {
    range: { from: f.from, to: f.to },
    compareRange,
    rows: rows
      .map((r) => ({ ...r, share: total ? Math.round((r.net / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.net - a.net),
  };
}

/**
 * Promotion effectiveness: the promotion window vs equally long windows before and after it
 * (daily averages, so a partial "after" window is still comparable).
 */
export async function promotionReport(input: PromotionReportInput) {
  const len = periodLength(input.from, input.to);
  const today = vnDateKey(new Date());
  const windows = [
    {
      key: "before",
      label: "Trước KM",
      from: shiftDateKey(input.from, -len),
      to: shiftDateKey(input.from, -1),
    },
    { key: "during", label: "Trong KM", from: input.from, to: input.to },
    {
      key: "after",
      label: "Sau KM",
      from: shiftDateKey(input.to, 1),
      to: shiftDateKey(input.to, len),
    },
  ];
  const result = await Promise.all(
    windows.map(async (w) => {
      const to = w.to > today ? today : w.to;
      const days = to >= w.from ? periodLength(w.from, to) : 0;
      const t = days
        ? await totals({ from: w.from, to, branchId: input.branchId })
        : toTotals(undefined);
      return {
        ...w,
        to,
        days,
        complete: days === len,
        ...t,
        netPerDay: days ? money(t.net / days) : 0,
        invoicesPerDay: days ? Math.round((t.invoices / days) * 10) / 10 : 0,
      };
    }),
  );
  const { start, end } = vnDateKeyRange(input.from, input.to);
  const coupon = await getPrisma().couponUsage.aggregate({
    where: {
      usedAt: { gte: start, lt: end },
      ...(input.couponId ? { couponId: input.couponId } : {}),
      ...(input.branchId ? { invoice: { branchId: input.branchId } } : {}),
    },
    _count: { _all: true },
    _sum: { discountAmount: true },
  });
  const [before, during, after] = result;
  return {
    windowDays: len,
    windows: result,
    upliftDuring: changePct(during.netPerDay, before.netPerDay),
    upliftAfter: after.days ? changePct(after.netPerDay, before.netPerDay) : null,
    couponUsage: { count: coupon._count._all, discount: money(n(coupon._sum.discountAmount)) },
  };
}

export async function inventoryReport(input: InventoryReportInput) {
  const prisma = getPrisma();
  const warehouseWhere: Prisma.WarehouseWhereInput = {
    isActive: true,
    ...(input.warehouseId ? { id: input.warehouseId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
  };
  const rows = await prisma.inventory.findMany({
    where: { warehouse: warehouseWhere },
    select: {
      quantity: true,
      minQuantity: true,
      warehouse: { select: { id: true, name: true } },
      product: {
        select: { id: true, name: true, sku: true, costPrice: true, minStock: true, status: true },
      },
    },
  });
  const byWarehouse = new Map<
    number,
    { warehouseId: number; name: string; skus: number; quantity: number; value: number }
  >();
  const lowStock = [];
  for (const r of rows) {
    const qty = n(r.quantity);
    const w = byWarehouse.get(r.warehouse.id) ?? {
      warehouseId: r.warehouse.id,
      name: r.warehouse.name,
      skus: 0,
      quantity: 0,
      value: 0,
    };
    if (qty > 0) w.skus++;
    w.quantity += qty;
    w.value += qty * n(r.product.costPrice);
    byWarehouse.set(r.warehouse.id, w);
    const min = Math.max(r.minQuantity, r.product.minStock);
    if (r.product.status === "active" && min > 0 && qty <= min) {
      lowStock.push({
        productId: r.product.id,
        name: r.product.name,
        sku: r.product.sku,
        warehouse: r.warehouse.name,
        quantity: qty,
        minQuantity: min,
      });
    }
  }
  const todayKey = vnDateKey(new Date());
  const today = new Date(`${todayKey}T00:00:00Z`);
  const limit = new Date(today.getTime() + input.expiringDays * DAY_MS);
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      quantity: { gt: 0 },
      expiryDate: { not: null, lte: limit },
      warehouse: warehouseWhere,
    },
    select: {
      batchCode: true,
      quantity: true,
      costPrice: true,
      expiryDate: true,
      product: { select: { id: true, name: true, sku: true, costPrice: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
    take: 500,
  });
  const batchRows = batches.map((b) => ({
    productId: b.product.id,
    name: b.product.name,
    sku: b.product.sku,
    warehouse: b.warehouse.name,
    batchCode: b.batchCode,
    quantity: n(b.quantity),
    expiryDate: b.expiryDate!.toISOString().slice(0, 10),
    daysLeft: Math.round((b.expiryDate!.getTime() - today.getTime()) / DAY_MS),
    value: money(n(b.quantity) * n(b.costPrice ?? b.product.costPrice)),
  }));
  const warehouses = [...byWarehouse.values()].map((w) => ({ ...w, value: money(w.value) }));
  return {
    totalValue: warehouses.reduce((s, w) => s + w.value, 0),
    totalQuantity: warehouses.reduce((s, w) => s + w.quantity, 0),
    warehouses: warehouses.sort((a, b) => b.value - a.value),
    lowStock: lowStock.sort((a, b) => a.quantity - b.quantity).slice(0, 200),
    expired: batchRows.filter((b) => b.daysLeft < 0),
    expiring: batchRows.filter((b) => b.daysLeft >= 0),
  };
}

/** Filter options for the report UI */
export async function reportOptions(allowedBranchIds?: number[]) {
  const prisma = getPrisma();
  const [branches, staff, categories, coupons, warehouses] = await Promise.all([
    prisma.branch.findMany({
      where: { status: "active", ...(allowedBranchIds ? { id: { in: allowedBranchIds } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, fullName: true, isActive: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.productCategory.findMany({
      select: { id: true, name: true, parentId: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.coupon.findMany({
      select: { id: true, code: true, name: true, startDate: true, endDate: true },
      orderBy: { id: "desc" },
      take: 100,
    }),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(allowedBranchIds
          ? { OR: [{ branchId: { in: allowedBranchIds } }, { branchId: null }] }
          : {}),
      },
      select: { id: true, name: true, branchId: true },
    }),
  ]);
  return { branches, staff, categories, coupons, warehouses };
}
