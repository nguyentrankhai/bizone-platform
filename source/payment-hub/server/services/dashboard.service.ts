import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { Prisma } from "@/generated/prisma/client";
import {
  ALERT_RULES,
  FAILED_STATUSES,
  PAID_STATUSES,
  failureSpikeAlert,
  fillChart,
  methodLabel,
  percentChange,
  periodRange,
  successRate,
  summarize,
  toMethodSlices,
  vnStartOfDay,
  type ChartPoint,
  type DashboardAlert,
  type DashboardData,
  type DashboardPeriod,
  type DashboardStatsEvent,
  type RecentTxn,
  type SummaryBlock,
  type TopMerchant,
} from "@/lib/dashboard";

/**
 * Dashboard aggregates (P3.7, SRS-PH-DASH-01, API-Design §6.1).
 *
 * Results are cached in Redis for CACHE_TTL_SECONDS per (scope, period) — API-Design §12
 * "Redis aggregate cache". The realtime relay (server/ws/dashboard.ts) drops the cache as soon
 * as a transaction event arrives, so the cache only bounds DB load, never freshness beyond it.
 */

export const CACHE_TTL_SECONDS = 15;
const CACHE_PREFIX = "payhub:dash:v1:";

export interface DashboardScope {
  /** Admin token bound to one merchant → only that merchant's data. */
  merchantId?: number;
}

function cacheKey(scope: DashboardScope, period: DashboardPeriod): string {
  return `${CACHE_PREFIX}${scope.merchantId ?? "all"}:${period}`;
}

const PAID_SQL = Prisma.join([...PAID_STATUSES]);
const FAILED_SQL = Prisma.join([...FAILED_STATUSES]);

function merchantSql(scope: DashboardScope, column = "t.merchant_id"): Prisma.Sql {
  return scope.merchantId !== undefined
    ? Prisma.sql` AND ${Prisma.raw(column)} = ${scope.merchantId}`
    : Prisma.empty;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

async function summaryBetween(from: Date, to: Date, scope: DashboardScope): Promise<SummaryBlock> {
  const rows = await getPrisma().transaction.groupBy({
    by: ["status"],
    where: { createdAt: { gte: from, lt: to }, merchantId: scope.merchantId },
    _count: { _all: true },
    _sum: { amount: true },
  });
  return summarize(
    rows.map((r) => ({ status: r.status, count: r._count._all, amount: num(r._sum.amount) })),
  );
}

async function dailyChart(from: Date, to: Date, scope: DashboardScope): Promise<ChartPoint[]> {
  const rows = await getPrisma().$queryRaw<
    { d: Date | string; c: bigint; amt: unknown; ok: unknown; ko: unknown }[]
  >(Prisma.sql`
    SELECT DATE(t.created_at + INTERVAL 7 HOUR) AS d,
           COUNT(*) AS c,
           COALESCE(SUM(CASE WHEN t.status IN (${PAID_SQL}) THEN t.amount ELSE 0 END), 0) AS amt,
           COALESCE(SUM(t.status IN (${PAID_SQL})), 0) AS ok,
           COALESCE(SUM(t.status IN (${FAILED_SQL})), 0) AS ko
    FROM transactions t
    WHERE t.created_at >= ${from} AND t.created_at < ${to}${merchantSql(scope)}
    GROUP BY d`);
  return rows.map((r) => ({
    date: r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10),
    count: num(r.c),
    amount: num(r.amt),
    successCount: num(r.ok),
    failedCount: num(r.ko),
  }));
}

async function methodBreakdown(from: Date, to: Date, scope: DashboardScope) {
  const rows = await getPrisma().$queryRaw<
    { ct: string | null; pm: string | null; c: bigint; amt: unknown }[]
  >(Prisma.sql`
    SELECT pc.connector_type AS ct, t.payment_method AS pm, COUNT(*) AS c,
           COALESCE(SUM(t.amount), 0) AS amt
    FROM transactions t
    LEFT JOIN partner_configs pc ON pc.id = t.partner_config_id
    WHERE t.created_at >= ${from} AND t.created_at < ${to}${merchantSql(scope)}
    GROUP BY pc.connector_type, t.payment_method`);
  return toMethodSlices(
    rows.map((r) => ({
      connectorType: r.ct,
      paymentMethod: r.pm,
      count: num(r.c),
      amount: num(r.amt),
    })),
  );
}

async function recentTransactions(scope: DashboardScope): Promise<RecentTxn[]> {
  const rows = await getPrisma().transaction.findMany({
    where: { merchantId: scope.merchantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      txnCode: true,
      amount: true,
      status: true,
      paymentMethod: true,
      createdAt: true,
      merchant: { select: { code: true } },
      partnerConfig: { select: { connectorType: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    txnCode: t.txnCode,
    amount: num(t.amount),
    status: t.status,
    partner: methodLabel(t.partnerConfig?.connectorType ?? null, t.paymentMethod),
    merchantCode: t.merchant.code,
    createdAt: t.createdAt.toISOString(),
  }));
}

async function topMerchants(from: Date, to: Date, scope: DashboardScope): Promise<TopMerchant[]> {
  const rows = await getPrisma().$queryRaw<
    { id: number; code: string; name: string; c: bigint; ok: unknown; ko: unknown; rev: unknown }[]
  >(Prisma.sql`
    SELECT m.id, m.code, m.name, COUNT(*) AS c,
           COALESCE(SUM(t.status IN (${PAID_SQL})), 0) AS ok,
           COALESCE(SUM(t.status IN (${FAILED_SQL})), 0) AS ko,
           COALESCE(SUM(CASE WHEN t.status IN (${PAID_SQL}) THEN t.amount ELSE 0 END), 0) AS rev
    FROM transactions t
    JOIN merchants m ON m.id = t.merchant_id
    WHERE t.created_at >= ${from} AND t.created_at < ${to}${merchantSql(scope)}
    GROUP BY m.id, m.code, m.name
    ORDER BY rev DESC, c DESC
    LIMIT 5`);
  return rows.map((r) => ({
    merchantId: Number(r.id),
    code: r.code,
    name: r.name,
    count: num(r.c),
    paidCount: num(r.ok),
    revenue: num(r.rev),
    successRate: successRate(num(r.ok), num(r.ko)),
  }));
}

/** SRS-PH-DASH-01-07: abnormal transaction failures, webhook failures, stuck outbox. */
export async function computeAlerts(
  scope: DashboardScope,
  now: Date = new Date(),
): Promise<DashboardAlert[]> {
  const prisma = getPrisma();
  const windowFrom = new Date(now.getTime() - ALERT_RULES.failureWindowMinutes * 60_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const stuckBefore = new Date(now.getTime() - ALERT_RULES.outboxStuckMinutes * 60_000);
  const webhookScope: Prisma.Sql =
    scope.merchantId !== undefined
      ? Prisma.sql` AND wc.merchant_id = ${scope.merchantId}`
      : Prisma.empty;

  const refundStuckBefore = new Date(now.getTime() - ALERT_RULES.refundStuckMinutes * 60_000);
  const [windowSummary, exhausted, failedAttempts, stuckOutbox, stuckRefunds] = await Promise.all([
    // Finished in the window = status changed recently; updated_at tracks the last transition.
    prisma.transaction.groupBy({
      by: ["status"],
      where: {
        updatedAt: { gte: windowFrom },
        status: { in: [...PAID_STATUSES, ...FAILED_STATUSES] },
        merchantId: scope.merchantId,
      },
      _count: { _all: true },
    }),
    // Deliveries whose last attempt failed with no retry left and that never succeeded later.
    prisma.$queryRaw<
      {
        delivery_id: string;
        event: string;
        request_url: string | null;
        txn_code: string | null;
        attempt: number;
        created_at: Date;
        response_status: number | null;
        error_message: string | null;
      }[]
    >(Prisma.sql`
      SELECT l.delivery_id, l.event, l.request_url, t.txn_code, l.attempt, l.created_at,
             l.response_status, l.error_message
      FROM webhook_logs l
      LEFT JOIN transactions t ON t.id = l.transaction_id
      LEFT JOIN webhook_configs wc ON wc.id = l.webhook_config_id
      WHERE l.status = 'Failed' AND l.next_retry_at IS NULL AND l.delivery_id IS NOT NULL
        AND l.event <> 'webhook.ping' AND l.created_at >= ${dayAgo}${webhookScope}
        AND NOT EXISTS (
          SELECT 1 FROM webhook_logs s
          WHERE s.delivery_id = l.delivery_id AND s.status = 'Success'
            AND (s.webhook_config_id <=> l.webhook_config_id)
        )
        AND l.id = (
          SELECT MAX(x.id) FROM webhook_logs x
          WHERE x.delivery_id = l.delivery_id AND (x.webhook_config_id <=> l.webhook_config_id)
        )
      ORDER BY l.created_at DESC
      LIMIT 20`),
    prisma.webhookLog.count({
      where: {
        status: "Failed",
        createdAt: { gte: hourAgo },
        event: { not: "webhook.ping" },
        ...(scope.merchantId !== undefined
          ? { webhookConfig: { merchantId: scope.merchantId } }
          : {}),
      },
    }),
    prisma.transaction.count({
      where: {
        notifyWebhook: true,
        webhookSentAt: null,
        updatedAt: { lt: stuckBefore },
        merchantId: scope.merchantId,
      },
    }),
    // P5.3: refunds the PSP has not confirmed — need polling to catch up or a manual confirmation
    prisma.refund.findMany({
      where: {
        status: "Processing",
        createdAt: { lt: refundStuckBefore },
        ...(scope.merchantId !== undefined
          ? { transaction: { merchantId: scope.merchantId } }
          : {}),
      },
      select: { transaction: { select: { txnCode: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  ]);

  const alerts: DashboardAlert[] = [];
  const w = summarize(
    windowSummary.map((r) => ({ status: r.status, count: r._count._all, amount: 0 })),
  );
  const spike = failureSpikeAlert({ paid: w.paid, failed: w.failed }, now);
  if (spike) alerts.push(spike);

  if (exhausted.length) {
    const latest = exhausted[0];
    const reason = latest.response_status
      ? `HTTP ${latest.response_status}`
      : (latest.error_message ?? "lỗi kết nối");
    alerts.push({
      id: "webhook-exhausted",
      level: "error",
      title: "Webhook thất bại",
      message:
        exhausted.length === 1
          ? `Webhook ${latest.event}${latest.txn_code ? ` (${latest.txn_code})` : ""} thất bại sau ${latest.attempt} lần gửi — ${reason}`
          : `${exhausted.length} webhook thất bại sau khi hết lượt retry trong 24 giờ qua — gần nhất ${latest.event}${latest.txn_code ? ` (${latest.txn_code})` : ""}: ${reason}`,
      count: exhausted.length,
      href: "/webhooks",
      at: new Date(latest.created_at).toISOString(),
    });
  }

  if (failedAttempts >= ALERT_RULES.webhookAttemptFailures) {
    alerts.push({
      id: "webhook-attempt-failures",
      level: "warning",
      title: "Webhook lỗi nhiều",
      message: `${failedAttempts} lần gửi webhook lỗi trong 60 phút qua (ngưỡng ${ALERT_RULES.webhookAttemptFailures})`,
      count: failedAttempts,
      href: "/webhooks",
      at: now.toISOString(),
    });
  }

  if (stuckOutbox > 0) {
    alerts.push({
      id: "webhook-outbox-stuck",
      level: "warning",
      title: "Webhook chưa được gửi",
      message: `${stuckOutbox} giao dịch chờ gửi webhook quá ${ALERT_RULES.outboxStuckMinutes} phút — kiểm tra worker/Redis`,
      count: stuckOutbox,
      href: "/webhooks",
      at: now.toISOString(),
    });
  }
  if (stuckRefunds.length > 0) {
    const oldest = stuckRefunds[0].transaction.txnCode;
    alerts.push({
      id: "refund-processing-stuck",
      level: "warning",
      title: "Hoàn tiền chờ xác nhận",
      message: `${stuckRefunds.length} yêu cầu hoàn tiền chưa được đối tác xác nhận sau ${ALERT_RULES.refundStuckMinutes} phút (cũ nhất: ${oldest}) — kiểm tra trên cổng đối tác rồi xác nhận trong chi tiết giao dịch`,
      count: stuckRefunds.length,
      href: `/transactions/${encodeURIComponent(oldest)}`,
      at: now.toISOString(),
    });
  }
  return alerts;
}

async function buildDashboard(
  period: DashboardPeriod,
  scope: DashboardScope,
  now: Date,
): Promise<DashboardData> {
  const r = periodRange(period, now);
  const [summary, previous, chartRows, paymentMethods, recent, top, alerts] = await Promise.all([
    summaryBetween(r.from, r.to, scope),
    summaryBetween(r.prevFrom, r.prevTo, scope),
    dailyChart(r.chartFrom, r.to, scope),
    methodBreakdown(r.from, r.to, scope),
    recentTransactions(scope),
    topMerchants(r.from, r.to, scope),
    computeAlerts(scope, now),
  ]);
  return {
    period,
    range: { from: r.from.toISOString(), to: now.toISOString() },
    summary,
    previous,
    changes: {
      total: percentChange(summary.total, previous.total),
      paidAmount: percentChange(summary.paidAmount, previous.paidAmount),
      paid: percentChange(summary.paid, previous.paid),
      failed: percentChange(summary.failed, previous.failed),
    },
    chart: fillChart(r.chartDays, chartRows),
    paymentMethods,
    recentTransactions: recent,
    topMerchants: top,
    alerts,
    generatedAt: now.toISOString(),
  };
}

/** Cached dashboard (≤ CACHE_TTL_SECONDS old). Redis errors fall back to a direct DB read. */
export async function getDashboard(
  period: DashboardPeriod,
  scope: DashboardScope,
): Promise<DashboardData> {
  const key = cacheKey(scope, period);
  try {
    const hit = await getRedis().get(key);
    if (hit) return JSON.parse(hit) as DashboardData;
  } catch {
    // cache unavailable — compute directly
  }
  const data = await buildDashboard(period, scope, new Date());
  try {
    await getRedis().set(key, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
  } catch {
    // ignore
  }
  return data;
}

/** Drops every cached dashboard (called by the realtime relay on transaction events). */
export async function invalidateDashboardCache(): Promise<number> {
  const redis = getRedis();
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${CACHE_PREFIX}*`, "COUNT", 100);
    cursor = next;
    if (keys.length) removed += await redis.unlink(...keys);
  } while (cursor !== "0");
  return removed;
}

/** Today's top-bar numbers straight from the DB (realtime `dashboard:stats`). */
export async function getTodayStats(
  scope: DashboardScope,
  now: Date = new Date(),
): Promise<DashboardStatsEvent> {
  const s = await summaryBetween(vnStartOfDay(now), new Date(now.getTime() + 1), scope);
  return {
    total_today: s.total,
    amount_today: s.paidAmount,
    success_count: s.paid,
    failed_count: s.failed,
    success_rate: s.successRate,
    generated_at: now.toISOString(),
  };
}
