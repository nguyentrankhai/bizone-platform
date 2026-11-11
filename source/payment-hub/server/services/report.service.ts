import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { PAID_STATUSES } from "@/lib/dashboard";
import {
  MAX_EXPORT_ROWS,
  buildRevenueReport,
  buildTxnReport,
  comparisonRange,
  summarizeRecon,
  trendMonths,
  vnRangeUtc,
  type CompareMode,
  type DateRange,
  type GroupBy,
  type ReconDayRow,
  type ReconFilters,
  type RevenueAggRow,
  type RevenueFilters,
  type RevenueReport,
  type TxnAggRow,
  type TxnFilters,
  type TxnReport,
} from "@/lib/report";
import { PAYMENT_METHODS } from "@/services/routing/routeMap";
import { DISCREPANCY, toDetailView, type DetailView } from "./reconciliation.service";

/**
 * Payment Hub reports (P5.5, SRS-PH-RPT-01..03, API-Design §6.9).
 *
 *  - Transactions: every transaction created in the range (status mix, amounts, estimated fees).
 *  - Revenue: paid transactions by payment time (`paid_at`) per partner / payment method, against
 *    a comparison period and a 12-month trend.
 *  - Reconciliation: the latest completed run of each partner config per day (P5.4) + the
 *    discrepancy rows of those runs with their resolution.
 *
 * Fees are estimates from the partner config's fee schedule (`fee_percent`, `fee_fixed`) applied
 * to each paid transaction — Payment Hub does not receive the partner's actual fee.
 * SQL does the aggregation (indexed on created_at / paid_at); the shaping is pure (lib/report.ts).
 */

const PAID_SQL = Prisma.join([...PAID_STATUSES]);
const DISCREPANCY_SQL = Prisma.join([...DISCREPANCY]);

/** Estimated fee of a paid transaction `t` joined with its partner config `pc`. */
const FEE_SQL = Prisma.sql`ROUND(t.amount * COALESCE(pc.fee_percent, 0) / 100) + COALESCE(pc.fee_fixed, 0)`;

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

function dayStr(v: Date | string): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function txnWhere(
  column: "created_at" | "paid_at",
  range: DateRange,
  f: TxnFilters & RevenueFilters,
): Prisma.Sql {
  const { start, end } = vnRangeUtc(range);
  const parts: Prisma.Sql[] = [
    Prisma.sql`t.${Prisma.raw(column)} >= ${start}`,
    Prisma.sql`t.${Prisma.raw(column)} < ${end}`,
  ];
  if (f.statuses?.length) parts.push(Prisma.sql`t.status IN (${Prisma.join(f.statuses)})`);
  if (f.partner) parts.push(Prisma.sql`pc.connector_type = ${f.partner}`);
  if (f.paymentMethod) parts.push(Prisma.sql`t.payment_method = ${f.paymentMethod}`);
  if (f.merchantId !== undefined) parts.push(Prisma.sql`t.merchant_id = ${f.merchantId}`);
  return Prisma.join(parts, " AND ");
}

// ─── Transactions (SRS-PH-RPT-01) ─────────────────────────────────────────────

export async function transactionReport(
  range: DateRange,
  groupBy: GroupBy,
  filters: TxnFilters,
): Promise<TxnReport> {
  const rows = await getPrisma().$queryRaw<
    { d: Date | string; st: string; c: bigint; amt: unknown; fee: unknown }[]
  >(Prisma.sql`
    SELECT DATE(t.created_at + INTERVAL 7 HOUR) AS d, t.status AS st, COUNT(*) AS c,
           COALESCE(SUM(t.amount), 0) AS amt,
           COALESCE(SUM(CASE WHEN t.status IN (${PAID_SQL}) THEN ${FEE_SQL} ELSE 0 END), 0) AS fee
    FROM transactions t
    LEFT JOIN partner_configs pc ON pc.id = t.partner_config_id
    WHERE ${txnWhere("created_at", range, filters)}
    GROUP BY d, st`);
  const agg: TxnAggRow[] = rows.map((r) => ({
    day: dayStr(r.d),
    status: r.st,
    count: num(r.c),
    amount: num(r.amt),
    fees: num(r.fee),
  }));
  return buildTxnReport(agg, range, groupBy, filters);
}

export interface TxnListRow {
  txnCode: string;
  merchantCode: string;
  merchantTxnId: string | null;
  amount: number;
  refundedAmount: number;
  fee: number;
  status: string;
  paymentMethod: string | null;
  partner: string | null;
  partnerName: string | null;
  partnerTxnId: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

/** Transactions of the report for Excel / CSV (oldest first, at most MAX_EXPORT_ROWS). */
export async function transactionList(
  range: DateRange,
  filters: TxnFilters,
  limit = MAX_EXPORT_ROWS,
): Promise<{ rows: TxnListRow[]; truncated: boolean }> {
  const rows = await getPrisma().$queryRaw<
    {
      txn_code: string;
      merchant_code: string;
      merchant_txn_id: string | null;
      amount: unknown;
      refunded_amount: unknown;
      fee: unknown;
      status: string;
      payment_method: string | null;
      connector_type: string | null;
      partner_name: string | null;
      partner_txn_id: string | null;
      created_at: Date;
      paid_at: Date | null;
    }[]
  >(Prisma.sql`
    SELECT t.txn_code, m.code AS merchant_code, t.merchant_txn_id, t.amount, t.refunded_amount,
           CASE WHEN t.status IN (${PAID_SQL}) THEN ${FEE_SQL} ELSE 0 END AS fee,
           t.status, t.payment_method, pc.connector_type, pc.name AS partner_name,
           t.partner_txn_id, t.created_at, t.paid_at
    FROM transactions t
    JOIN merchants m ON m.id = t.merchant_id
    LEFT JOIN partner_configs pc ON pc.id = t.partner_config_id
    WHERE ${txnWhere("created_at", range, filters)}
    ORDER BY t.created_at, t.id
    LIMIT ${limit + 1}`);
  return {
    truncated: rows.length > limit,
    rows: rows.slice(0, limit).map((r) => ({
      txnCode: r.txn_code,
      merchantCode: r.merchant_code,
      merchantTxnId: r.merchant_txn_id,
      amount: num(r.amount),
      refundedAmount: num(r.refunded_amount),
      fee: num(r.fee),
      status: r.status,
      paymentMethod: r.payment_method,
      partner: r.connector_type,
      partnerName: r.partner_name,
      partnerTxnId: r.partner_txn_id,
      createdAt: r.created_at,
      paidAt: r.paid_at,
    })),
  };
}

// ─── Revenue (SRS-PH-RPT-02) ──────────────────────────────────────────────────

async function revenueRows(range: DateRange, filters: RevenueFilters): Promise<RevenueAggRow[]> {
  const rows = await getPrisma().$queryRaw<
    {
      ct: string | null;
      pm: string | null;
      c: bigint;
      gross: unknown;
      ref: unknown;
      fee: unknown;
    }[]
  >(Prisma.sql`
    SELECT pc.connector_type AS ct, t.payment_method AS pm, COUNT(*) AS c,
           COALESCE(SUM(t.amount), 0) AS gross, COALESCE(SUM(t.refunded_amount), 0) AS ref,
           COALESCE(SUM(${FEE_SQL}), 0) AS fee
    FROM transactions t
    LEFT JOIN partner_configs pc ON pc.id = t.partner_config_id
    WHERE t.status IN (${PAID_SQL}) AND ${txnWhere("paid_at", range, filters)}
    GROUP BY pc.connector_type, t.payment_method`);
  return rows.map((r) => ({
    connectorType: r.ct,
    paymentMethod: r.pm,
    count: num(r.c),
    gross: num(r.gross),
    refunded: num(r.ref),
    fees: num(r.fee),
  }));
}

export async function revenueReport(
  range: DateRange,
  compare: CompareMode,
  filters: RevenueFilters,
): Promise<RevenueReport> {
  const months = trendMonths(range.to);
  const trendRange = { from: `${months[0]}-01`, to: range.to };
  const [current, previous, trend] = await Promise.all([
    revenueRows(range, filters),
    revenueRows(comparisonRange(range, compare), filters),
    getPrisma().$queryRaw<
      { mo: string; c: bigint; gross: unknown; ref: unknown; fee: unknown }[]
    >(Prisma.sql`
      SELECT DATE_FORMAT(t.paid_at + INTERVAL 7 HOUR, '%Y-%m') AS mo, COUNT(*) AS c,
             COALESCE(SUM(t.amount), 0) AS gross, COALESCE(SUM(t.refunded_amount), 0) AS ref,
             COALESCE(SUM(${FEE_SQL}), 0) AS fee
      FROM transactions t
      LEFT JOIN partner_configs pc ON pc.id = t.partner_config_id
      WHERE t.status IN (${PAID_SQL}) AND ${txnWhere("paid_at", trendRange, filters)}
      GROUP BY mo`),
  ]);
  return buildRevenueReport({
    range,
    compare,
    filters,
    current,
    previous,
    trend: trend.map((r) => ({
      month: r.mo,
      count: num(r.c),
      gross: num(r.gross),
      refunded: num(r.ref),
      fees: num(r.fee),
    })),
  });
}

// ─── Reconciliation (SRS-PH-RPT-03) ───────────────────────────────────────────

/** Latest completed run per partner config and day (a re-run supersedes earlier ones). */
export async function reconciliationDays(
  range: DateRange,
  filters: ReconFilters,
): Promise<ReconDayRow[]> {
  const where: Prisma.Sql[] = [
    Prisma.sql`r.status = 'Completed'`,
    Prisma.sql`r.run_date >= ${range.from}`,
    Prisma.sql`r.run_date <= ${range.to}`,
  ];
  if (filters.partner) where.push(Prisma.sql`pc.connector_type = ${filters.partner}`);
  if (filters.partnerConfigId !== undefined) {
    where.push(Prisma.sql`r.partner_config_id = ${filters.partnerConfigId}`);
  }
  const rows = await getPrisma().$queryRaw<
    {
      id: number;
      run_date: Date | string;
      partner_config_id: number;
      name: string;
      connector_type: string;
      source: string;
      total_paymenthub: number;
      total_partner: number;
      total_amount_paymenthub: unknown;
      total_amount_partner: unknown;
      matched_count: number;
      unmatched_paymenthub: number;
      unmatched_partner: number;
      amount_mismatch_count: number;
      unverified_count: number;
      total_discrepancy: unknown;
      open_cnt: bigint;
    }[]
  >(Prisma.sql`
    SELECT r.id, r.run_date, r.partner_config_id, pc.name, pc.connector_type, r.source,
           r.total_paymenthub, r.total_partner, r.total_amount_paymenthub, r.total_amount_partner,
           r.matched_count, r.unmatched_paymenthub, r.unmatched_partner, r.amount_mismatch_count,
           r.unverified_count, r.total_discrepancy,
           (SELECT COUNT(*) FROM reconciliation_details d
             WHERE d.reconciliation_run_id = r.id AND d.status = 'Open'
               AND d.match_status IN (${DISCREPANCY_SQL})) AS open_cnt
    FROM reconciliation_runs r
    JOIN partner_configs pc ON pc.id = r.partner_config_id
    WHERE ${Prisma.join(where, " AND ")}
      AND r.id = (SELECT MAX(x.id) FROM reconciliation_runs x
                  WHERE x.partner_config_id = r.partner_config_id AND x.run_date = r.run_date
                    AND x.status = 'Completed')
    ORDER BY r.run_date DESC, pc.connector_type, r.partner_config_id`);
  return rows.map((r) => ({
    runId: Number(r.id),
    date: dayStr(r.run_date),
    partnerConfigId: Number(r.partner_config_id),
    partnerName: r.name,
    partner: r.connector_type,
    source: r.source,
    totalPaymenthub: num(r.total_paymenthub),
    totalPartner: num(r.total_partner),
    amountPaymenthub: num(r.total_amount_paymenthub),
    amountPartner: num(r.total_amount_partner),
    matched: num(r.matched_count),
    unmatchedPaymenthub: num(r.unmatched_paymenthub),
    unmatchedPartner: num(r.unmatched_partner),
    amountMismatch: num(r.amount_mismatch_count),
    unverified: num(r.unverified_count),
    discrepancy: num(r.total_discrepancy),
    open: num(r.open_cnt),
  }));
}

export async function reconciliationReport(range: DateRange, filters: ReconFilters) {
  const days = await reconciliationDays(range, filters);
  return { range, filters, ...summarizeRecon(days), days, generatedAt: new Date().toISOString() };
}

export type ReconciliationReport = Awaited<ReturnType<typeof reconciliationReport>>;

export interface ReconDiscrepancyRow extends DetailView {
  run_id: number;
  run_date: string;
  partner_name: string;
  partner: string;
}

export interface DiscrepancyQuery {
  status?: "Open" | "Resolved";
  search?: string;
  page: number;
  limit: number;
}

/** Discrepancy rows of the given runs (biggest difference first) with their resolution. */
export async function reconciliationDiscrepancies(runIds: number[], q: DiscrepancyQuery) {
  const prisma = getPrisma();
  const where: Prisma.ReconciliationDetailWhereInput = {
    reconciliationRunId: { in: runIds },
    matchStatus: { in: DISCREPANCY },
    status: q.status,
    ...(q.search
      ? {
          OR: [
            { txnCode: { contains: q.search } },
            { partnerTxnId: { contains: q.search } },
            { partnerRef: { contains: q.search } },
          ],
        }
      : {}),
  };
  if (!runIds.length) {
    return { items: [], meta: { page: q.page, limit: q.limit, total: 0, totalPages: 0 } };
  }
  const [rows, total] = await Promise.all([
    prisma.reconciliationDetail.findMany({
      where,
      include: {
        reconciliationRun: {
          select: {
            id: true,
            runDate: true,
            partnerConfig: { select: { name: true, connectorType: true } },
          },
        },
      },
      orderBy: [{ discrepancyAmount: "desc" }, { id: "asc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.reconciliationDetail.count({ where }),
  ]);
  return {
    items: rows.map((d): ReconDiscrepancyRow => ({
      ...toDetailView(d),
      run_id: d.reconciliationRun.id,
      run_date: d.reconciliationRun.runDate.toISOString().slice(0, 10),
      partner_name: d.reconciliationRun.partnerConfig.name,
      partner: d.reconciliationRun.partnerConfig.connectorType,
    })),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  };
}

// ─── Filter options ───────────────────────────────────────────────────────────

export async function reportOptions(merchantId?: number) {
  const prisma = getPrisma();
  const [partners, merchants] = await Promise.all([
    prisma.partnerConfig.findMany({
      select: { id: true, name: true, connectorType: true },
      orderBy: [{ connectorType: "asc" }, { id: "asc" }],
    }),
    prisma.merchant.findMany({
      where: merchantId !== undefined ? { id: merchantId } : undefined,
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return {
    partnerTypes: [...new Set(partners.map((p) => p.connectorType))],
    partnerConfigs: partners.map((p) => ({ id: p.id, name: p.name, partner: p.connectorType })),
    merchants,
    paymentMethods: [...PAYMENT_METHODS],
  };
}

export type ReportOptions = Awaited<ReturnType<typeof reportOptions>>;
