import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { cached as cachedValue, CACHE_TTL, entryKey, invalidate } from "@/lib/cache";
import { currentTenantId } from "@/lib/tenant";
import { vnDateKey, vnDayRange, vnDayStart } from "@/lib/vn-time";

/** PLAN P2.9: dữ liệu dashboard cũ không quá 30 s — TTL ngắn + xoá ngay khi có HĐ/đơn mới */
export const DASHBOARD_CACHE_TTL = CACHE_TTL.dashboard;

type CachePart =
  "today" | "revenue7d" | "top_products" | "payment_breakdown" | "pending_orders" | "low_stock";

/**
 * Keys are per tenant (own database) and per branch scope (P4.6: `all` or the branch id), so
 * cached numbers never leak across tenants or branches.
 */
export function dashboardCacheKey(
  tenantId: string,
  part: CachePart,
  branchId?: number,
  version = "0",
): string {
  return entryKey(tenantId, "dashboard", version, dashboardSuffix(part, branchId));
}

/** Phần đuôi khoá trong vùng cache `dashboard` (lib/cache thêm tenant + phiên bản) */
export function dashboardSuffix(part: CachePart, branchId?: number): string {
  return `${branchId ?? "all"}:${part}`;
}

/** Invoice / order filter of a branch scope (undefined = every branch) */
const inBranch = (branchId?: number) => (branchId ? { branchId } : {});

function cached<T>(
  part: CachePart,
  branchId: number | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  // P6.5: lib/cache.ts — khoá theo tenant + phiên bản; phần đuôi giữ chi nhánh + phần số liệu
  return cachedValue("dashboard", dashboardSuffix(part, branchId), fn, DASHBOARD_CACHE_TTL);
}

/** Hôm nay theo giờ VN: [start, end) */
function todayRange() {
  return vnDayRange(0);
}

/** 7 ngày gần nhất (gồm hôm nay) theo giờ VN: [start, end) */
function last7Days() {
  return { start: vnDayStart(6), end: vnDayRange(0).end };
}

/**
 * Payments by method, net of change: `invoice_payments.amount` is what the customer handed
 * over, the change (always cash) is on `invoices.change_amount` — same rule as the cash
 * session summary.
 */
export function netPaymentsByMethod(
  groups: { paymentMethod: string; amount: number }[],
  changeTotal: number,
): { method: string; label: string; amount: number }[] {
  const byMethod = new Map<string, number>();
  for (const g of groups)
    byMethod.set(g.paymentMethod, (byMethod.get(g.paymentMethod) ?? 0) + g.amount);
  if (changeTotal) byMethod.set("cash", (byMethod.get("cash") ?? 0) - changeTotal);
  return [...byMethod.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([method, amount]) => ({ method, label: PAYMENT_LABELS[method] ?? method, amount }));
}

async function paymentsFor(where: {
  createdAt: { gte: Date; lt: Date };
  status: "active";
  branchId?: number;
}) {
  const prisma = getPrisma();
  const [groups, change] = await Promise.all([
    prisma.invoicePayment.groupBy({
      by: ["paymentMethod"],
      where: { invoice: where },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({ where, _sum: { changeAmount: true } }),
  ]);
  return netPaymentsByMethod(
    groups.map((g) => ({ paymentMethod: g.paymentMethod, amount: Number(g._sum.amount ?? 0) })),
    Number(change._sum.changeAmount ?? 0),
  );
}

// ─── Today stats ─────────────────────────────────────────────────────────────

export async function getTodayStats(branchId?: number) {
  return cached("today", branchId, async () => {
    const prisma = getPrisma();
    const { start, end } = todayRange();

    const [invoiceResult, orderResult, newCustomers, lowStockCount] = await Promise.all([
      // Doanh thu hôm nay (hóa đơn POS active)
      prisma.invoice.aggregate({
        where: { createdAt: { gte: start, lt: end }, status: "active", ...inBranch(branchId) },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Đơn hàng online hôm nay (pending + confirmed)
      prisma.order.count({
        where: { createdAt: { gte: start, lt: end }, ...inBranch(branchId) },
      }),
      // Khách hàng mới hôm nay
      prisma.customer.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      // SP tồn kho cảnh báo (raw query vì so sánh 2 cột)
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM inventory iv
        ${branchId ? Prisma.sql`JOIN warehouses w ON w.id = iv.warehouse_id AND w.branch_id = ${branchId}` : Prisma.empty}
        WHERE iv.quantity <= iv.min_quantity AND iv.min_quantity > 0
      `.then((r) => Number(r[0]?.cnt ?? 0)),
    ]);

    // Doanh thu hôm qua để tính % tăng
    const { start: yesterday, end: yesterdayEnd } = vnDayRange(1);

    const yesterdayRevenue = await prisma.invoice.aggregate({
      where: {
        createdAt: { gte: yesterday, lt: yesterdayEnd },
        status: "active",
        ...inBranch(branchId),
      },
      _sum: { totalAmount: true },
    });

    const todayRevenue = Number(invoiceResult._sum.totalAmount ?? 0);
    const ydRevenue = Number(yesterdayRevenue._sum.totalAmount ?? 0);
    const revenueChange = ydRevenue > 0 ? ((todayRevenue - ydRevenue) / ydRevenue) * 100 : null;

    return {
      revenue: todayRevenue,
      revenueChange: revenueChange !== null ? Math.round(revenueChange * 10) / 10 : null,
      invoiceCount: invoiceResult._count.id,
      orderCount: orderResult,
      newCustomers,
      lowStockCount,
    };
  });
}

// ─── Revenue 7 days ───────────────────────────────────────────────────────────

export async function getRevenue7Days(branchId?: number) {
  return cached("revenue7d", branchId, async () => {
    const prisma = getPrisma();
    const { start } = last7Days();

    // P6.5: summed per VN day in SQL (was: every invoice of the 7 days loaded and added in JS)
    const rows = await prisma.$queryRaw<{ d: string; revenue: unknown }[]>`
      SELECT DATE_FORMAT(created_at + INTERVAL 7 HOUR, '%Y-%m-%d') AS d, SUM(total_amount) AS revenue
      FROM invoices
      WHERE created_at >= ${start} AND status = 'active'
        ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
      GROUP BY d`;

    const byDate: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) byDate[vnDateKey(vnDayStart(i))] = 0;
    for (const r of rows) if (r.d in byDate) byDate[r.d] += Number(r.revenue);

    return Object.entries(byDate).map(([date, revenue]) => ({ date, revenue }));
  });
}

// ─── Top 5 products ───────────────────────────────────────────────────────────

export async function getTopProducts(branchId?: number) {
  return cached("top_products", branchId, async () => {
    const prisma = getPrisma();
    const { start } = last7Days();

    const items = await prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: {
        invoice: { createdAt: { gte: start }, status: "active", ...inBranch(branchId) },
      },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    return items.map((item, idx) => ({
      rank: idx + 1,
      productId: item.productId,
      name: pMap.get(item.productId)?.name ?? "SP không xác định",
      sku: pMap.get(item.productId)?.sku ?? "",
      quantity: Number(item._sum.quantity ?? 0),
      revenue: Number(item._sum.totalAmount ?? 0),
    }));
  });
}

// ─── Payment method breakdown ─────────────────────────────────────────────────

export async function getPaymentBreakdown(branchId?: number) {
  return cached("payment_breakdown", branchId, async () => {
    const { start, end } = todayRange();
    return paymentsFor({
      createdAt: { gte: start, lt: end },
      status: "active",
      ...inBranch(branchId),
    });
  });
}

// ─── Pending orders (cần xử lý) ──────────────────────────────────────────────

export async function getPendingOrders(branchId?: number) {
  return cached("pending_orders", branchId, async () => {
    const prisma = getPrisma();
    return prisma.order.findMany({
      where: { status: { in: ["pending", "confirmed"] }, ...inBranch(branchId) },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: {
        id: true,
        orderCode: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        customer: { select: { fullName: true } },
      },
    });
  });
}

// ─── Low stock warnings ───────────────────────────────────────────────────────

export async function getLowStockItems(branchId?: number) {
  return cached("low_stock", branchId, async () => {
    const prisma = getPrisma();
    const items = await prisma.$queryRaw<
      Array<{
        product_id: number;
        name: string;
        quantity: number;
        min_quantity: number;
      }>
    >`
      SELECT i.product_id, p.name, i.quantity, i.min_quantity
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      ${branchId ? Prisma.sql`JOIN warehouses w ON w.id = i.warehouse_id AND w.branch_id = ${branchId}` : Prisma.empty}
      WHERE i.quantity <= i.min_quantity
        AND i.min_quantity > 0
      ORDER BY i.quantity ASC, i.id ASC
      LIMIT 5
    `;
    return items.map((r) => ({
      productId: Number(r.product_id),
      name: r.name,
      quantity: Number(r.quantity),
      minQuantity: Number(r.min_quantity),
    }));
  });
}

// ─── Full dashboard (single call) ────────────────────────────────────────────

export async function getDashboardSummary(branchId?: number) {
  const [todayStats, revenue7d, topProducts, paymentBreakdown, pendingOrders, lowStock] =
    await Promise.all([
      getTodayStats(branchId),
      getRevenue7Days(branchId),
      getTopProducts(branchId),
      getPaymentBreakdown(branchId),
      getPendingOrders(branchId),
      getLowStockItems(branchId),
    ]);

  return { todayStats, revenue7d, topProducts, paymentBreakdown, pendingOrders, lowStock };
}

// ─── Invalidate cache (gọi sau khi có giao dịch mới) ─────────────────────────

/**
 * Drop every branch scope of the tenant (a sale changes its branch and "all"). P6.5: bumps the
 * namespace version instead of SCAN-ing the keyspace on every sale.
 */
export async function invalidateDashboardCache(tenantId: string = currentTenantId()) {
  await invalidate("dashboard", tenantId);
}

// ─── Drill-down: một ngày trên biểu đồ doanh thu ─────────────────────────────

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  card: "Thẻ",
  transfer: "Chuyển khoản",
  qr: "QR",
  wallet: "Ví điện tử",
  debt: "Công nợ",
};

/** Chi tiết doanh thu một ngày (giờ VN) khi bấm vào cột biểu đồ — không cache, phạm vi 1 ngày */
export async function getDayDetail(date: string, branchId?: number) {
  const prisma = getPrisma();
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const where = {
    createdAt: { gte: start, lt: end },
    status: "active" as const,
    ...inBranch(branchId),
  };

  const [totals, payments, items, invoices] = await Promise.all([
    prisma.invoice.aggregate({ where, _sum: { totalAmount: true }, _count: { id: true } }),
    paymentsFor(where),
    prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: { invoice: where },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        invoiceCode: true,
        totalAmount: true,
        createdAt: true,
        customer: { select: { fullName: true } },
      },
    }),
  ]);

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));

  return {
    date,
    revenue: Number(totals._sum.totalAmount ?? 0),
    invoiceCount: totals._count.id,
    payments,
    topProducts: items.map((i) => ({
      productId: i.productId,
      name: pMap.get(i.productId)?.name ?? "SP không xác định",
      sku: pMap.get(i.productId)?.sku ?? "",
      quantity: Number(i._sum.quantity ?? 0),
      revenue: Number(i._sum.totalAmount ?? 0),
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceCode: inv.invoiceCode,
      totalAmount: Number(inv.totalAmount),
      createdAt: inv.createdAt.toISOString(),
      customerName: inv.customer?.fullName ?? null,
    })),
  };
}
