/**
 * Payment Hub reports (P5.5, SRS-PH-RPT-01..03, API-Design §6.9) — shared types and pure helpers
 * used by the report service, the exports and the client. No server-only imports here.
 *
 * Business days are Vietnam days (UTC+7); the DB stores DATETIME in UTC. A report range is a pair
 * of Vietnam calendar days, both inclusive.
 */

import { FAILED_STATUSES, PAID_STATUSES, methodLabel, vnDateKey } from "@/lib/dashboard";
import { ROUTE_MAP } from "@/services/routing/routeMap";

export const REPORT_TYPES = ["transactions", "revenue", "reconciliation"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["xlsx", "pdf", "csv"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const GROUP_BYS = ["day", "week", "month"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const COMPARE_MODES = ["previous", "year"] as const;
/** previous = same-length period right before; year = same days one year earlier ("cùng kỳ"). */
export type CompareMode = (typeof COMPARE_MODES)[number];

export const REPORT_TITLES: Record<ReportType, string> = {
  transactions: "Báo cáo giao dịch",
  revenue: "Báo cáo doanh thu",
  reconciliation: "Báo cáo đối soát",
};

/** Longest range one report covers (a year, leap day included). */
export const MAX_RANGE_DAYS = 366;
/** Transactions listed in an Excel / CSV export of the transaction report. */
export const MAX_EXPORT_ROWS = 50_000;
/** Months shown in the revenue growth chart (ending with the month of `to`). */
export const TREND_MONTHS = 12;

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

export const PENDING_STATUSES = ["Created", "Pending"] as const;
export const TXN_STATUSES = [
  "Created",
  "Pending",
  "Success",
  "Failed",
  "Expired",
  "Refunded",
  "PartiallyRefunded",
] as const;

/** Status filter shortcuts accepted next to the raw statuses. */
export const STATUS_GROUPS: Record<string, readonly string[]> = {
  paid: PAID_STATUSES,
  failed: FAILED_STATUSES,
  pending: PENDING_STATUSES,
};

export const PARTNERS = ["VNPay", "MoMo", "ZaloPay", "VietQR"] as const;

// ─── Dates ────────────────────────────────────────────────────────────────────

export interface DateRange {
  /** First Vietnam day, YYYY-MM-DD (inclusive). */
  from: string;
  /** Last Vietnam day, YYYY-MM-DD (inclusive). */
  to: string;
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return dayFromMs(dayMs(day) + n * DAY_MS);
}

export function rangeDays(r: DateRange): number {
  return Math.round((dayMs(r.to) - dayMs(r.from)) / DAY_MS) + 1;
}

/** UTC instants [start, end) covering the Vietnam days of the range. */
export function vnRangeUtc(r: DateRange): { start: Date; end: Date } {
  return {
    start: new Date(dayMs(r.from) - VN_OFFSET_MS),
    end: new Date(dayMs(r.to) + DAY_MS - VN_OFFSET_MS),
  };
}

export function todayVn(now: Date = new Date()): string {
  return vnDateKey(now);
}

export type RangeResult = { ok: true; range: DateRange } | { ok: false; message: string };

/** Validates `from`/`to` (defaults: the last 7 days up to today, Vietnam time). */
export function parseRange(
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): RangeResult {
  const today = todayVn(now);
  const t = to || today;
  const f = from || addDays(t, -6);
  if (!isIsoDate(f) || !isIsoDate(t)) {
    return { ok: false, message: "from / to phải có dạng YYYY-MM-DD" };
  }
  if (f > t) return { ok: false, message: "from phải trước hoặc bằng to" };
  const range = { from: f, to: t };
  if (rangeDays(range) > MAX_RANGE_DAYS) {
    return { ok: false, message: `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày` };
  }
  return { ok: true, range };
}

function shiftYear(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number);
  // 29/02 → 28/02 in a non-leap year
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Comparison period: same length right before, or the same days one year earlier. */
export function comparisonRange(r: DateRange, mode: CompareMode): DateRange {
  if (mode === "year") return { from: shiftYear(r.from, -1), to: shiftYear(r.to, -1) };
  const n = rangeDays(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

/** Day buckets when the range is short, weeks up to ~4 months, months beyond. */
export function defaultGroupBy(r: DateRange): GroupBy {
  const n = rangeDays(r);
  return n <= 31 ? "day" : n <= 120 ? "week" : "month";
}

/** Bucket of a Vietnam day: the day, the Monday of its week, or YYYY-MM. */
export function bucketKey(day: string, groupBy: GroupBy): string {
  if (groupBy === "day") return day;
  if (groupBy === "month") return day.slice(0, 7);
  const dow = new Date(dayMs(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function bucketLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === "month") return `${key.slice(5, 7)}/${key.slice(0, 4)}`;
  if (groupBy === "week") return `${dm(key)}–${dm(addDays(key, 6))}`;
  return `${dm(key)}/${key.slice(0, 4)}`;
}

/** Ordered bucket keys covering the range (every bucket, even empty ones). */
export function bucketsIn(r: DateRange, groupBy: GroupBy): string[] {
  const keys: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const k = bucketKey(d, groupBy);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

/** The TREND_MONTHS months (YYYY-MM) ending with the month of `day`. */
export function trendMonths(day: string, count = TREND_MONTHS): string[] {
  const [y, m] = day.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

export const RANGE_PRESETS = {
  today: "Hôm nay",
  "7days": "7 ngày qua",
  "30days": "30 ngày qua",
  thisMonth: "Tháng này",
  lastMonth: "Tháng trước",
  thisYear: "Năm nay",
  custom: "Tùy chọn",
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

/** Range of a preset relative to `today` (Vietnam day). `custom` keeps the last 7 days. */
export function presetRange(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "30days":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lastMonth": {
      const lastDay = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case "thisYear":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: addDays(today, -6), to: today };
  }
}

export function formatDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

// ─── Filters & labels ─────────────────────────────────────────────────────────

/** "paid,Failed" → raw statuses; null when a value is unknown. Empty → undefined (all). */
export function parseStatuses(raw: string | null | undefined): string[] | undefined | null {
  if (!raw?.trim()) return undefined;
  const out = new Set<string>();
  for (const part of raw.split(",").map((s) => s.trim())) {
    if (!part) continue;
    const group = STATUS_GROUPS[part];
    if (group) group.forEach((s) => out.add(s));
    else if ((TXN_STATUSES as readonly string[]).includes(part)) out.add(part);
    else return null;
  }
  return out.size ? [...out] : undefined;
}

export function partnerLabel(connectorType: string | null): string {
  return connectorType ? methodLabel(connectorType, null) : "Chưa chọn đối tác";
}

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "Chưa chọn";
  return (ROUTE_MAP as Record<string, { label: string }>)[method]?.label ?? method;
}

/** Contract fee of one successful transaction (VND, rounded). */
export function feeOf(amount: number, feePercent: number, feeFixed: number): number {
  return Math.round((amount * feePercent) / 100) + feeFixed;
}

export function successRate(paid: number, failed: number): number | null {
  const done = paid + failed;
  return done ? Math.round((paid / done) * 1000) / 10 : null;
}

/** Growth vs the comparison period (%, one decimal); null when there is nothing to compare. */
export function growth(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function share(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

// ─── Transaction report (SRS-PH-RPT-01) ───────────────────────────────────────

export interface TxnFilters {
  statuses?: string[];
  /** partner_configs.connector_type */
  partner?: string;
  paymentMethod?: string;
  merchantId?: number;
}

/** One SQL aggregate row: a Vietnam day × status. */
export interface TxnAggRow {
  day: string;
  status: string;
  count: number;
  amount: number;
  /** Estimated fee (paid transactions only). */
  fees: number;
}

export interface TxnTotals {
  total: number;
  paid: number;
  failed: number;
  pending: number;
  /** Refunded / partially refunded (subset of paid). */
  refunded: number;
  /** Amount of every transaction in the report. */
  totalAmount: number;
  /** Amount of paid transactions. */
  paidAmount: number;
  fees: number;
  successRate: number | null;
}

export interface TxnBucket extends TxnTotals {
  key: string;
  label: string;
}

export interface TxnReport {
  range: DateRange;
  groupBy: GroupBy;
  filters: TxnFilters;
  summary: TxnTotals;
  buckets: TxnBucket[];
  generatedAt: string;
}

function emptyTotals(): TxnTotals {
  return {
    total: 0,
    paid: 0,
    failed: 0,
    pending: 0,
    refunded: 0,
    totalAmount: 0,
    paidAmount: 0,
    fees: 0,
    successRate: null,
  };
}

function addRow(t: TxnTotals, r: TxnAggRow): void {
  t.total += r.count;
  t.totalAmount += r.amount;
  if ((PAID_STATUSES as readonly string[]).includes(r.status)) {
    t.paid += r.count;
    t.paidAmount += r.amount;
    t.fees += r.fees;
    if (r.status !== "Success") t.refunded += r.count;
  } else if ((FAILED_STATUSES as readonly string[]).includes(r.status)) {
    t.failed += r.count;
  } else {
    t.pending += r.count;
  }
}

export function buildTxnReport(
  rows: TxnAggRow[],
  range: DateRange,
  groupBy: GroupBy,
  filters: TxnFilters,
  now: Date = new Date(),
): TxnReport {
  const summary = emptyTotals();
  const byKey = new Map<string, TxnTotals>();
  for (const r of rows) {
    addRow(summary, r);
    const k = bucketKey(r.day, groupBy);
    const b = byKey.get(k) ?? emptyTotals();
    addRow(b, r);
    byKey.set(k, b);
  }
  summary.successRate = successRate(summary.paid, summary.failed);
  const buckets = bucketsIn(range, groupBy).map((key) => {
    const b = byKey.get(key) ?? emptyTotals();
    b.successRate = successRate(b.paid, b.failed);
    return { key, label: bucketLabel(key, groupBy), ...b };
  });
  return { range, groupBy, filters, summary, buckets, generatedAt: now.toISOString() };
}

// ─── Revenue report (SRS-PH-RPT-02) ───────────────────────────────────────────

export interface RevenueFilters {
  partner?: string;
  merchantId?: number;
}

/** One SQL aggregate row of paid transactions: connector type × payment method. */
export interface RevenueAggRow {
  connectorType: string | null;
  paymentMethod: string | null;
  count: number;
  gross: number;
  refunded: number;
  fees: number;
}

export interface RevenueTotals {
  count: number;
  /** Amount paid by customers. */
  gross: number;
  /** Already refunded out of `gross`. */
  refunded: number;
  /** Estimated partner fees. */
  fees: number;
  /** gross − refunded − fees */
  net: number;
}

export interface RevenueLine extends RevenueTotals {
  key: string;
  label: string;
  /** Share of gross revenue (%). */
  percentage: number;
  previous: RevenueTotals;
  /** Gross growth vs the comparison period (%). */
  growth: number | null;
}

export interface TrendPoint extends RevenueTotals {
  key: string;
  label: string;
}

export interface RevenueReport {
  range: DateRange;
  compare: CompareMode;
  previousRange: DateRange;
  filters: RevenueFilters;
  summary: RevenueTotals & {
    previous: RevenueTotals;
    growth: number | null;
    netGrowth: number | null;
    countGrowth: number | null;
  };
  byPartner: RevenueLine[];
  byMethod: RevenueLine[];
  trend: TrendPoint[];
  generatedAt: string;
}

function emptyRevenue(): RevenueTotals {
  return { count: 0, gross: 0, refunded: 0, fees: 0, net: 0 };
}

function addRevenue(t: RevenueTotals, r: Omit<RevenueAggRow, "connectorType" | "paymentMethod">) {
  t.count += r.count;
  t.gross += r.gross;
  t.refunded += r.refunded;
  t.fees += r.fees;
  t.net = t.gross - t.refunded - t.fees;
}

function totalsOf(rows: RevenueAggRow[]): RevenueTotals {
  const t = emptyRevenue();
  rows.forEach((r) => addRevenue(t, r));
  return t;
}

/** Groups current + comparison rows by a key; lines sorted by gross revenue. */
export function revenueLines(
  current: RevenueAggRow[],
  previous: RevenueAggRow[],
  keyOf: (r: RevenueAggRow) => string,
  labelOf: (key: string) => string,
): RevenueLine[] {
  const cur = new Map<string, RevenueTotals>();
  const prev = new Map<string, RevenueTotals>();
  for (const [rows, map] of [
    [current, cur],
    [previous, prev],
  ] as const) {
    for (const r of rows) {
      const k = keyOf(r);
      const t = map.get(k) ?? emptyRevenue();
      addRevenue(t, r);
      map.set(k, t);
    }
  }
  const total = [...cur.values()].reduce((a, t) => a + t.gross, 0);
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  return [...keys]
    .map((key) => {
      const c = cur.get(key) ?? emptyRevenue();
      const p = prev.get(key) ?? emptyRevenue();
      return {
        key,
        label: labelOf(key),
        ...c,
        percentage: share(c.gross, total),
        previous: p,
        growth: growth(c.gross, p.gross),
      };
    })
    .sort((a, b) => b.gross - a.gross || b.previous.gross - a.previous.gross);
}

export const partnerKey = (r: RevenueAggRow) => partnerLabel(r.connectorType);
export const methodKey = (r: RevenueAggRow) => r.paymentMethod ?? "";

export function buildRevenueReport(input: {
  range: DateRange;
  compare: CompareMode;
  filters: RevenueFilters;
  current: RevenueAggRow[];
  previous: RevenueAggRow[];
  /** Monthly rows: key = YYYY-MM. */
  trend: (Omit<RevenueAggRow, "connectorType" | "paymentMethod"> & { month: string })[];
  now?: Date;
}): RevenueReport {
  const cur = totalsOf(input.current);
  const prev = totalsOf(input.previous);
  const months = new Map(input.trend.map((t) => [t.month, t]));
  return {
    range: input.range,
    compare: input.compare,
    previousRange: comparisonRange(input.range, input.compare),
    filters: input.filters,
    summary: {
      ...cur,
      previous: prev,
      growth: growth(cur.gross, prev.gross),
      netGrowth: growth(cur.net, prev.net),
      countGrowth: growth(cur.count, prev.count),
    },
    byPartner: revenueLines(input.current, input.previous, partnerKey, (k) => k),
    byMethod: revenueLines(input.current, input.previous, methodKey, (k) =>
      paymentMethodLabel(k || null),
    ),
    trend: trendMonths(input.range.to).map((key) => {
      const t = emptyRevenue();
      const m = months.get(key);
      if (m) addRevenue(t, m);
      return { key, label: bucketLabel(key, "month"), ...t };
    }),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

// ─── Reconciliation report (SRS-PH-RPT-03) ────────────────────────────────────

export interface ReconFilters {
  partner?: string;
  partnerConfigId?: number;
}

/** Latest completed run of one partner config on one day. */
export interface ReconDayRow {
  runId: number;
  date: string;
  partnerConfigId: number;
  partnerName: string;
  partner: string;
  source: string;
  totalPaymenthub: number;
  totalPartner: number;
  amountPaymenthub: number;
  amountPartner: number;
  matched: number;
  unmatchedPaymenthub: number;
  unmatchedPartner: number;
  amountMismatch: number;
  unverified: number;
  discrepancy: number;
  /** Discrepancy rows not resolved yet. */
  open: number;
}

export type ReconDayStatus = "matched" | "open" | "resolved" | "unverified";

export const RECON_DAY_STATUS_LABELS: Record<ReconDayStatus, string> = {
  matched: "Khớp",
  open: "Cần xử lý",
  resolved: "Đã xử lý",
  unverified: "Chưa tra cứu đủ",
};

export function unmatchedOf(r: ReconDayRow): number {
  return r.unmatchedPaymenthub + r.unmatchedPartner + r.amountMismatch;
}

export function reconDayStatus(r: ReconDayRow): ReconDayStatus {
  if (r.open > 0) return "open";
  if (unmatchedOf(r) > 0) return "resolved";
  return r.unverified > 0 ? "unverified" : "matched";
}

export interface ReconDailyPoint {
  date: string;
  runs: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
}

export interface ReconSummary {
  runs: number;
  days: number;
  totalPaymenthub: number;
  totalPartner: number;
  amountPaymenthub: number;
  amountPartner: number;
  matched: number;
  unmatched: number;
  unmatchedPaymenthub: number;
  unmatchedPartner: number;
  amountMismatch: number;
  unverified: number;
  discrepancy: number;
  open: number;
  /** % of compared transactions that matched. */
  matchRate: number | null;
}

export function summarizeRecon(rows: ReconDayRow[]): {
  summary: ReconSummary;
  daily: ReconDailyPoint[];
} {
  const s: ReconSummary = {
    runs: rows.length,
    days: new Set(rows.map((r) => r.date)).size,
    totalPaymenthub: 0,
    totalPartner: 0,
    amountPaymenthub: 0,
    amountPartner: 0,
    matched: 0,
    unmatched: 0,
    unmatchedPaymenthub: 0,
    unmatchedPartner: 0,
    amountMismatch: 0,
    unverified: 0,
    discrepancy: 0,
    open: 0,
    matchRate: null,
  };
  const daily = new Map<string, ReconDailyPoint>();
  for (const r of rows) {
    s.totalPaymenthub += r.totalPaymenthub;
    s.totalPartner += r.totalPartner;
    s.amountPaymenthub += r.amountPaymenthub;
    s.amountPartner += r.amountPartner;
    s.matched += r.matched;
    s.unmatchedPaymenthub += r.unmatchedPaymenthub;
    s.unmatchedPartner += r.unmatchedPartner;
    s.amountMismatch += r.amountMismatch;
    s.unverified += r.unverified;
    s.discrepancy += r.discrepancy;
    s.open += r.open;
    const d = daily.get(r.date) ?? {
      date: r.date,
      runs: 0,
      matched: 0,
      unmatched: 0,
      discrepancy: 0,
    };
    d.runs += 1;
    d.matched += r.matched;
    d.unmatched += unmatchedOf(r);
    d.discrepancy += r.discrepancy;
    daily.set(r.date, d);
  }
  s.unmatched = s.unmatchedPaymenthub + s.unmatchedPartner + s.amountMismatch;
  const compared = s.matched + s.unmatched;
  s.matchRate = compared ? Math.round((s.matched / compared) * 1000) / 10 : null;
  return {
    summary: s,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

type Cell = string | number | null | undefined;

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  // Spreadsheet formula injection: a text cell must not start with = + - @ (or tab / CR)
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 BOM (Excel opens Vietnamese text correctly). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function reportFileName(type: ReportType, range: DateRange, ext: ReportFormat): string {
  const slug = { transactions: "giao-dich", revenue: "doanh-thu", reconciliation: "doi-soat" }[
    type
  ];
  return `bao-cao-${slug}-${range.from}_${range.to}.${ext}`;
}
