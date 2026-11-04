import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

const CACHE_TTL = 300; // 5 phút

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const result = await fn();
  await redis.setex(key, CACHE_TTL, JSON.stringify(result));
  return result;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function last7Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ─── Today stats ─────────────────────────────────────────────────────────────

export async function getTodayStats() {
  return cached("dashboard:today", async () => {
    const prisma = getPrisma();
    const { start, end } = todayRange();

    const [invoiceResult, orderResult, newCustomers, lowStockCount] = await Promise.all([
      // Doanh thu hôm nay (hóa đơn POS active)
      prisma.invoice.aggregate({
        where: { createdAt: { gte: start, lte: end }, status: "active" },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Đơn hàng online hôm nay (pending + confirmed)
      prisma.order.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      // Khách hàng mới hôm nay
      prisma.customer.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      // SP tồn kho cảnh báo (raw query vì so sánh 2 cột)
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM inventory
        WHERE quantity <= min_quantity AND min_quantity > 0
      `.then((r) => Number(r[0]?.cnt ?? 0)),
    ]);

    // Doanh thu hôm qua để tính % tăng
    const yesterday = new Date(start);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(end);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    const yesterdayRevenue = await prisma.invoice.aggregate({
      where: {
        createdAt: { gte: yesterday, lte: yesterdayEnd },
        status: "active",
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

export async function getRevenue7Days() {
  return cached("dashboard:revenue7d", async () => {
    const prisma = getPrisma();
    const { start } = last7Days();

    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: start }, status: "active" },
      select: { totalAmount: true, createdAt: true },
    });

    // Group by date
    const byDate: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      byDate[d.toISOString().slice(0, 10)] = 0;
    }
    for (const inv of invoices) {
      const key = inv.createdAt.toISOString().slice(0, 10);
      if (key in byDate) byDate[key] += Number(inv.totalAmount);
    }

    return Object.entries(byDate).map(([date, revenue]) => ({ date, revenue }));
  });
}

// ─── Top 5 products ───────────────────────────────────────────────────────────

export async function getTopProducts() {
  return cached("dashboard:top_products", async () => {
    const prisma = getPrisma();
    const { start } = last7Days();

    const items = await prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: {
        invoice: { createdAt: { gte: start }, status: "active" },
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

export async function getPaymentBreakdown() {
  return cached("dashboard:payment_breakdown", async () => {
    const prisma = getPrisma();
    const { start, end } = todayRange();

    const payments = await prisma.invoicePayment.groupBy({
      by: ["paymentMethod"],
      where: {
        invoice: { createdAt: { gte: start, lte: end }, status: "active" },
      },
      _sum: { amount: true },
    });

    const labels: Record<string, string> = {
      cash: "Tiền mặt",
      card: "Thẻ",
      transfer: "Chuyển khoản",
      qr: "QR",
      debt: "Công nợ",
    };

    return payments.map((p) => ({
      method: p.paymentMethod,
      label: labels[p.paymentMethod] ?? p.paymentMethod,
      amount: Number(p._sum.amount ?? 0),
    }));
  });
}

// ─── Pending orders (cần xử lý) ──────────────────────────────────────────────

export async function getPendingOrders() {
  return cached("dashboard:pending_orders", async () => {
    const prisma = getPrisma();
    return prisma.order.findMany({
      where: { status: { in: ["pending", "confirmed"] } },
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

export async function getLowStockItems() {
  return cached("dashboard:low_stock", async () => {
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
      WHERE i.quantity <= i.min_quantity
        AND i.min_quantity > 0
      ORDER BY i.quantity ASC
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

export async function getDashboardSummary() {
  const [todayStats, revenue7d, topProducts, paymentBreakdown, pendingOrders, lowStock] =
    await Promise.all([
      getTodayStats(),
      getRevenue7Days(),
      getTopProducts(),
      getPaymentBreakdown(),
      getPendingOrders(),
      getLowStockItems(),
    ]);

  return { todayStats, revenue7d, topProducts, paymentBreakdown, pendingOrders, lowStock };
}

// ─── Invalidate cache (gọi sau khi có giao dịch mới) ─────────────────────────

export async function invalidateDashboardCache() {
  const redis = getRedis();
  await redis.del(
    "dashboard:today",
    "dashboard:revenue7d",
    "dashboard:top_products",
    "dashboard:payment_breakdown",
    "dashboard:pending_orders",
    "dashboard:low_stock",
  );
}
