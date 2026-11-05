/**
 * Payment Hub dashboard (P3.7) — shared types and pure helpers used by the service, the
 * realtime relay and the client. No server-only imports here.
 *
 * Business days are Vietnam days (UTC+7, no DST): "hôm nay" starts at 00:00 ICT while the DB
 * stores DATETIME in UTC.
 */

export const DASHBOARD_PERIODS = ["today", "7days", "30days"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export function isDashboardPeriod(v: unknown): v is DashboardPeriod {
  return typeof v === "string" && (DASHBOARD_PERIODS as readonly string[]).includes(v);
}

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Hôm nay",
  "7days": "7 ngày",
  "30days": "30 ngày",
};

/** Vietnam offset in minutes (ICT = UTC+7, no daylight saving). */
export const VN_OFFSET_MINUTES = 420;
const DAY_MS = 86_400_000;
const OFFSET_MS = VN_OFFSET_MINUTES * 60_000;

/** Statuses counted as a successful payment (money received, possibly refunded later). */
export const PAID_STATUSES = ["Success", "Refunded", "PartiallyRefunded"] as const;
/** Statuses counted as a failed payment. */
export const FAILED_STATUSES = ["Failed", "Expired"] as const;

/** YYYY-MM-DD of the Vietnam calendar day containing `d`. */
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 ICT on the Vietnam day containing `d`. */
export function vnStartOfDay(d: Date): Date {
  const shifted = d.getTime() + OFFSET_MS;
  return new Date(shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS) - OFFSET_MS);
}

export interface PeriodRange {
  /** Current window [from, to). */
  from: Date;
  to: Date;
  /** Same-length window right before (comparison "so với kỳ trước"). */
  prevFrom: Date;
  prevTo: Date;
  /** Days shown in the trend chart, oldest first (YYYY-MM-DD, Vietnam days). */
  chartDays: string[];
  /** UTC start of the first chart day. */
  chartFrom: Date;
}

/**
 * today  → 00:00 ICT today … now, compared with yesterday 00:00 … same time yesterday.
 * 7days  → 00:00 ICT six days ago … now (7 calendar days incl. today), vs the 7 days before.
 * 30days → likewise with 30 days.
 * The trend chart always covers at least the last 7 days (SRS-PH-DASH-01-02).
 */
export function periodRange(period: DashboardPeriod, now: Date = new Date()): PeriodRange {
  const days = period === "today" ? 1 : period === "7days" ? 7 : 30;
  const todayStart = vnStartOfDay(now);
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const to = new Date(now.getTime() + 1); // inclusive of "now"
  const span = days * DAY_MS;
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(to.getTime() - span);

  const chartLength = Math.max(days, 7);
  const chartFrom = new Date(todayStart.getTime() - (chartLength - 1) * DAY_MS);
  const chartDays = Array.from({ length: chartLength }, (_, i) =>
    vnDateKey(new Date(chartFrom.getTime() + i * DAY_MS)),
  );
  return { from, to, prevFrom, prevTo, chartDays, chartFrom };
}

/** Partner/method label for the pie chart: connector type wins, else the requested method. */
export function methodLabel(connectorType: string | null, paymentMethod: string | null): string {
  const raw = (connectorType ?? paymentMethod ?? "").toLowerCase();
  if (!raw) return "Chưa chọn";
  if (raw.startsWith("vnpay")) return "VNPay";
  if (raw.startsWith("vietqr") || raw === "qr" || raw === "bank_transfer") return "VietQR";
  if (raw.startsWith("momo")) return "MoMo";
  if (raw.startsWith("zalopay")) return "ZaloPay";
  return connectorType ?? paymentMethod ?? "Khác";
}

export interface StatusCounts {
  total: number;
  paid: number;
  failed: number; // Failed + Expired
  pending: number; // Created + Pending
  refunded: number; // Refunded + PartiallyRefunded (subset of paid)
  expired: number; // subset of failed
}

export interface SummaryBlock extends StatusCounts {
  /** Sum of amounts of paid transactions (VND). */
  paidAmount: number;
  /** Sum of amounts of all transactions created in the window (VND). */
  totalAmount: number;
  /** paid / (paid + failed) × 100, one decimal; null when nothing finished yet. */
  successRate: number | null;
}

export function successRate(paid: number, failed: number): number | null {
  const done = paid + failed;
  return done ? Math.round((paid / done) * 1000) / 10 : null;
}

/** Percentage change vs previous window, one decimal; null when the previous value is 0. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function summarize(rows: { status: string; count: number; amount: number }[]): SummaryBlock {
  const s: SummaryBlock = {
    total: 0,
    paid: 0,
    failed: 0,
    pending: 0,
    refunded: 0,
    expired: 0,
    paidAmount: 0,
    totalAmount: 0,
    successRate: null,
  };
  for (const r of rows) {
    s.total += r.count;
    s.totalAmount += r.amount;
    if ((PAID_STATUSES as readonly string[]).includes(r.status)) {
      s.paid += r.count;
      s.paidAmount += r.amount;
      if (r.status !== "Success") s.refunded += r.count;
    } else if ((FAILED_STATUSES as readonly string[]).includes(r.status)) {
      s.failed += r.count;
      if (r.status === "Expired") s.expired += r.count;
    } else {
      s.pending += r.count;
    }
  }
  s.successRate = successRate(s.paid, s.failed);
  return s;
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD (Vietnam day)
  count: number;
  amount: number; // paid amount
  successCount: number;
  failedCount: number;
}

/** Fills missing days with zeros so the chart always has one point per day. */
export function fillChart(days: string[], rows: ChartPoint[]): ChartPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return days.map(
    (date) => byDate.get(date) ?? { date, count: 0, amount: 0, successCount: 0, failedCount: 0 },
  );
}

export interface MethodSlice {
  method: string;
  count: number;
  amount: number;
  percentage: number;
}

export function toMethodSlices(
  rows: {
    connectorType: string | null;
    paymentMethod: string | null;
    count: number;
    amount: number;
  }[],
): MethodSlice[] {
  const merged = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const key = methodLabel(r.connectorType, r.paymentMethod);
    const m = merged.get(key) ?? { count: 0, amount: 0 };
    m.count += r.count;
    m.amount += r.amount;
    merged.set(key, m);
  }
  const total = [...merged.values()].reduce((a, m) => a + m.count, 0);
  return [...merged.entries()]
    .map(([method, m]) => ({
      method,
      count: m.count,
      amount: m.amount,
      percentage: total ? Math.round((m.count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface RecentTxn {
  id: number;
  txnCode: string;
  amount: number;
  status: string;
  partner: string;
  merchantCode: string;
  createdAt: string;
}

export interface TopMerchant {
  merchantId: number;
  code: string;
  name: string;
  count: number;
  paidCount: number;
  revenue: number;
  successRate: number | null;
}

export type AlertLevel = "error" | "warning" | "info";

export interface DashboardAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  count?: number;
  href?: string;
  at: string;
}

/** Thresholds for SRS-PH-DASH-01-07 (abnormal failures / webhook failures). */
export const ALERT_RULES = {
  /** Look-back window for the failure-spike rule. */
  failureWindowMinutes: 60,
  /** Minimum failed transactions in the window before alerting (avoid noise on low volume). */
  failureMinCount: 5,
  /** Failure rate (%) among finished transactions in the window that triggers an alert. */
  failureRatePercent: 30,
  /** Failed webhook attempts in the last hour that trigger a warning. */
  webhookAttemptFailures: 5,
  /** Outbox rows older than this (minutes) are considered stuck. */
  outboxStuckMinutes: 5,
} as const;

export function failureSpikeAlert(
  window: { paid: number; failed: number },
  now: Date = new Date(),
): DashboardAlert | null {
  const done = window.paid + window.failed;
  if (window.failed < ALERT_RULES.failureMinCount || !done) return null;
  const rate = (window.failed / done) * 100;
  if (rate < ALERT_RULES.failureRatePercent) return null;
  return {
    id: "txn-failure-spike",
    level: "error",
    title: "Giao dịch lỗi bất thường",
    message: `${window.failed}/${done} giao dịch thất bại/hết hạn (${rate.toFixed(1)}%) trong ${ALERT_RULES.failureWindowMinutes} phút qua — ngưỡng ${ALERT_RULES.failureRatePercent}%`,
    count: window.failed,
    href: "/transactions?status=Failed",
    at: now.toISOString(),
  };
}

export interface DashboardData {
  period: DashboardPeriod;
  range: { from: string; to: string };
  summary: SummaryBlock;
  previous: SummaryBlock;
  changes: {
    total: number | null;
    paidAmount: number | null;
    paid: number | null;
    failed: number | null;
  };
  chart: ChartPoint[];
  paymentMethods: MethodSlice[];
  recentTransactions: RecentTxn[];
  topMerchants: TopMerchant[];
  alerts: DashboardAlert[];
  generatedAt: string;
}

/** Realtime top-bar payload (`dashboard:stats`, API-Design §9 Dashboard namespace). */
export interface DashboardStatsEvent {
  total_today: number;
  amount_today: number;
  success_count: number;
  failed_count: number;
  success_rate: number | null;
  generated_at: string;
}

export const DASHBOARD_WS_SUBSCRIBE = { type: "subscribe", channel: "dashboard" } as const;
