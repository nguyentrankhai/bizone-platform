import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  connectorFromPartnerConfig,
  definitionForConnectorType,
} from "@/services/connectors/registry";
import {
  PAID_STATUSES,
  isPaidStatus,
  matchTransactions,
  type HubTxn,
  type MatchDetail,
  type MatchStatus,
  type PartnerRecord,
} from "@/services/reconciliation/engine";
import { getLatestPartnerRequest } from "./payment.service";

/**
 * Reconciliation runs (P5.4, SRS-PH-RECON-01, API-Design §6.7 / §8.3).
 *
 * One run = one partner config × one business day (Vietnam time). The Hub side is every payment of
 * that config paid that day; the partner side comes from
 *  - Api:  a status query per Hub transaction (payments of the day + transactions of the day the
 *          Hub did not record as paid, to catch money the Hub gave up on — issue #19);
 *  - File: an imported PSP / bank statement (the only way to see payments the Hub never knew of,
 *          and the only source for VietQR — issue #24).
 * The run never changes transactions: discrepancies are reported, operators resolve them.
 */

export class ReconError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "SOURCE_UNSUPPORTED",
    message: string,
  ) {
    super(message);
    this.name = "ReconError";
  }
}

export const RECON_ERROR_STATUS: Record<ReconError["code"], number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  SOURCE_UNSUPPORTED: 400,
};

const VN_OFFSET_MS = 7 * 3_600_000;
const API_CONCURRENCY = Math.max(1, Number(process.env.RECON_API_CONCURRENCY ?? 8));
const NON_PAID = ["Pending", "Expired", "Failed"] as const;

// ─── Dates (business day = Vietnam time, DB = UTC) ────────────────────────────

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function vnDayRange(day: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - VN_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function vnYesterday(now = new Date()): string {
  return vnDateKey(new Date(now.getTime() - 86_400_000));
}

// ─── Hub side ─────────────────────────────────────────────────────────────────

const HUB_SELECT = {
  id: true,
  txnCode: true,
  amount: true,
  status: true,
  partnerTxnId: true,
  paidAt: true,
} as const;

function toHub(
  t: {
    id: number;
    txnCode: string;
    amount: Prisma.Decimal;
    status: string;
    partnerTxnId: string | null;
    paidAt: Date | null;
  },
  range: { start: Date; end: Date },
): HubTxn {
  return {
    id: t.id,
    txnCode: t.txnCode,
    amount: Number(t.amount),
    status: t.status,
    partnerTxnId: t.partnerTxnId,
    paidAt: t.paidAt,
    inPeriod:
      isPaidStatus(t.status) && !!t.paidAt && t.paidAt >= range.start && t.paidAt < range.end,
  };
}

/** Payments of the partner config paid on `day` + transactions named by partner records. */
export async function loadHubSide(
  partnerConfigId: number,
  day: string,
  extra: { txnCodes?: string[]; partnerTxnIds?: string[] } = {},
): Promise<HubTxn[]> {
  const prisma = getPrisma();
  const range = vnDayRange(day);
  const paid = await prisma.transaction.findMany({
    where: {
      partnerConfigId,
      status: { in: [...PAID_STATUSES] },
      paidAt: { gte: range.start, lt: range.end },
    },
    select: HUB_SELECT,
  });
  const seen = new Set(paid.map((t) => t.txnCode));
  const codes = [...new Set(extra.txnCodes ?? [])].filter((c) => !seen.has(c));
  const ids = [...new Set(extra.partnerTxnIds ?? [])];
  const known = new Set(paid.map((t) => t.partnerTxnId).filter(Boolean));
  const more: typeof paid = [];
  for (let i = 0; i < codes.length; i += 1000) {
    more.push(
      ...(await prisma.transaction.findMany({
        where: { txnCode: { in: codes.slice(i, i + 1000) } },
        select: HUB_SELECT,
      })),
    );
  }
  const idsLeft = ids.filter((x) => !known.has(x));
  for (let i = 0; i < idsLeft.length; i += 1000) {
    more.push(
      ...(await prisma.transaction.findMany({
        where: { partnerConfigId, partnerTxnId: { in: idsLeft.slice(i, i + 1000) } },
        select: HUB_SELECT,
      })),
    );
  }
  const all = new Map<number, (typeof paid)[number]>();
  for (const t of [...paid, ...more]) all.set(t.id, t);
  return [...all.values()].map((t) => toHub(t, range));
}

// ─── Partner side: status queries ─────────────────────────────────────────────

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Ask the partner about every payment of the day and every transaction of the day the Hub did not
 * record as paid (one status query each — the PSPs used here have no "list transactions" API).
 */
export async function queryPartnerSide(
  partnerConfigId: number,
  day: string,
): Promise<{ hub: HubTxn[]; records: PartnerRecord[] }> {
  const prisma = getPrisma();
  const pc = await prisma.partnerConfig.findUnique({ where: { id: partnerConfigId } });
  if (!pc) throw new ReconError("NOT_FOUND", "Không tìm thấy cấu hình đối tác");
  const def = definitionForConnectorType(pc.connectorType);
  if (!def) {
    throw new ReconError(
      "SOURCE_UNSUPPORTED",
      `${pc.connectorType} không có API tra cứu giao dịch — đối soát bằng cách nhập file sao kê`,
    );
  }
  const range = vnDayRange(day);
  const hub = await loadHubSide(partnerConfigId, day);
  const unpaid = await prisma.transaction.findMany({
    where: {
      partnerConfigId,
      status: { in: [...NON_PAID] },
      createdAt: { gte: range.start, lt: range.end },
    },
    select: HUB_SELECT,
  });
  for (const t of unpaid) hub.push(toHub(t, range));

  const { connector } = connectorFromPartnerConfig(pc);
  const records = await mapLimit(hub, API_CONCURRENCY, async (t): Promise<PartnerRecord> => {
    const sent = await getLatestPartnerRequest(t.id, def.code);
    const partnerOrderId = sent?.orderId ?? sent?.app_trans_id ?? undefined;
    try {
      const st = await connector.getStatus({
        txnCode: t.txnCode,
        partnerOrderId,
        transactionDate: sent?.vnp_CreateDate ?? "",
        ipAddress: "127.0.0.1",
      });
      const base = {
        ref: partnerOrderId ?? t.txnCode,
        txnCode: t.txnCode,
        partnerTxnId: st.partnerTxnId ?? null,
        amount: st.amount ?? null,
        statusText: `${st.responseCode}${st.message ? ` ${st.message}` : ""}`.slice(0, 50),
      };
      if (!st.signatureValid || st.outcome === "Unknown") {
        return {
          ...base,
          status: "Unknown",
          unverified: true,
          note: `Không tra cứu được (${st.responseCode}: ${st.message})`.slice(0, 500),
        };
      }
      return { ...base, status: st.outcome };
    } catch (e) {
      return {
        ref: partnerOrderId ?? t.txnCode,
        txnCode: t.txnCode,
        partnerTxnId: null,
        amount: null,
        status: "Unknown",
        unverified: true,
        note: `Không tra cứu được: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      };
    }
  });
  return { hub, records };
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  partnerConfigId: number;
  runDate: string;
  source: "Api" | "File";
  sourceFile?: string;
  triggeredBy: string;
}

export async function createRun(input: CreateRunInput) {
  const prisma = getPrisma();
  if (!isIsoDate(input.runDate))
    throw new ReconError("VALIDATION_ERROR", "Ngày đối soát không hợp lệ");
  if (input.runDate >= vnDateKey(new Date())) {
    throw new ReconError("VALIDATION_ERROR", "Chỉ đối soát được ngày đã kết thúc (trước hôm nay)");
  }
  const pc = await prisma.partnerConfig.findUnique({ where: { id: input.partnerConfigId } });
  if (!pc) throw new ReconError("NOT_FOUND", "Không tìm thấy cấu hình đối tác");
  if (input.source === "Api" && !definitionForConnectorType(pc.connectorType)) {
    throw new ReconError(
      "SOURCE_UNSUPPORTED",
      `${pc.connectorType} không có API tra cứu giao dịch — đối soát bằng cách nhập file sao kê`,
    );
  }
  const runDate = new Date(`${input.runDate}T00:00:00Z`);
  const running = await prisma.reconciliationRun.findFirst({
    where: { partnerConfigId: pc.id, runDate, status: "Running" },
  });
  if (running) {
    throw new ReconError(
      "CONFLICT",
      `Đang có đợt đối soát #${running.id} cho ${pc.name} ngày ${input.runDate}`,
    );
  }
  return prisma.reconciliationRun.create({
    data: {
      partnerConfigId: pc.id,
      runDate,
      status: "Running",
      source: input.source,
      sourceFile: input.sourceFile?.slice(0, 255) ?? null,
      triggeredBy: input.triggeredBy.slice(0, 100),
      startedAt: new Date(),
    },
  });
}

/**
 * Execute a Running run: build both sides, match, store every row (matched ones too — the report
 * lists them), then the totals. `statement` = records of an imported file (source File).
 */
export async function executeRun(
  runId: number,
  statement?: { records: PartnerRecord[]; notes?: string },
): Promise<RunView> {
  const prisma = getPrisma();
  const run = await prisma.reconciliationRun.findUnique({ where: { id: runId } });
  if (!run) throw new ReconError("NOT_FOUND", "Không tìm thấy đợt đối soát");
  if (run.status !== "Running") return getRun(runId);
  const day = run.runDate.toISOString().slice(0, 10);

  try {
    let hub: HubTxn[];
    let records: PartnerRecord[];
    if (run.source === "File") {
      records = statement?.records ?? [];
      hub = await loadHubSide(run.partnerConfigId, day, {
        txnCodes: records.map((r) => r.txnCode).filter((c): c is string => !!c),
        partnerTxnIds: records.map((r) => r.partnerTxnId).filter((c): c is string => !!c),
      });
    } else {
      ({ hub, records } = await queryPartnerSide(run.partnerConfigId, day));
    }
    const { details, summary } = matchTransactions(hub, records);

    await prisma.reconciliationDetail.deleteMany({ where: { reconciliationRunId: runId } });
    for (let i = 0; i < details.length; i += 1000) {
      await prisma.reconciliationDetail.createMany({
        data: details.slice(i, i + 1000).map((d) => toDetailRow(runId, d)),
      });
    }
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: "Completed",
        ...summary,
        notes: statement?.notes ?? null,
        completedAt: new Date(),
      },
    });
    const discrepancies =
      summary.unmatchedPaymenthub + summary.unmatchedPartner + summary.amountMismatchCount;
    void publishEvent("recon.completed", {
      runId,
      partnerConfigId: run.partnerConfigId,
      runDate: day,
      discrepancies,
      totalDiscrepancy: summary.totalDiscrepancy,
    }).catch(() => {});
    if (discrepancies > 0) {
      console.warn(
        `[recon] run #${runId} (${day}, partner config #${run.partnerConfigId}): ${discrepancies} discrepancies, ${summary.totalDiscrepancy} VND`,
      );
    }
  } catch (e) {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: "Failed",
        errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
        completedAt: new Date(),
      },
    });
    if (e instanceof ReconError) return getRun(runId);
    console.error(`[recon] run #${runId} failed:`, e);
  }
  return getRun(runId);
}

function toDetailRow(runId: number, d: MatchDetail): Prisma.ReconciliationDetailCreateManyInput {
  return {
    reconciliationRunId: runId,
    transactionId: d.transactionId,
    txnCode: d.txnCode,
    partnerTxnId: d.partnerTxnId?.slice(0, 255) ?? null,
    partnerRef: d.partnerRef?.slice(0, 255) ?? null,
    matchStatus: d.matchStatus,
    paymenthubAmount: d.paymenthubAmount,
    partnerAmount: d.partnerAmount,
    discrepancyAmount: d.discrepancyAmount,
    partnerTxnDate: d.partnerTxnDate,
    paymenthubStatus: d.paymenthubStatus,
    partnerStatus: d.partnerStatus?.slice(0, 50) ?? null,
    note: d.note?.slice(0, 500) ?? null,
    // Nothing to resolve on matched / unverified rows
    status: "Open",
  };
}

// ─── Daily job ────────────────────────────────────────────────────────────────

/**
 * Partner configs with Hub activity on `day` whose connector can be queried; a config already
 * reconciled by status queries that day is skipped (worker restarts, duplicate schedulers).
 */
export async function dailyCandidates(day: string): Promise<number[]> {
  const prisma = getPrisma();
  const range = vnDayRange(day);
  const rows = await prisma.transaction.groupBy({
    by: ["partnerConfigId"],
    where: {
      partnerConfigId: { not: null },
      OR: [
        { status: { in: [...PAID_STATUSES] }, paidAt: { gte: range.start, lt: range.end } },
        { status: { in: [...NON_PAID] }, createdAt: { gte: range.start, lt: range.end } },
      ],
    },
  });
  const ids = rows.map((r) => r.partnerConfigId!).filter(Boolean);
  if (!ids.length) return [];
  const configs = await prisma.partnerConfig.findMany({ where: { id: { in: ids } } });
  const done = await prisma.reconciliationRun.findMany({
    where: {
      partnerConfigId: { in: ids },
      runDate: new Date(`${day}T00:00:00Z`),
      source: "Api",
      status: { in: ["Running", "Completed"] },
    },
    select: { partnerConfigId: true },
  });
  const skip = new Set(done.map((d) => d.partnerConfigId));
  return configs
    .filter((c) => definitionForConnectorType(c.connectorType) && !skip.has(c.id))
    .map((c) => c.id);
}

// ─── Read / resolve ───────────────────────────────────────────────────────────

export const DISCREPANCY: MatchStatus[] = [
  "Unmatched_PaymentHub",
  "Unmatched_Partner",
  "Amount_Mismatch",
];

type RunRow = Prisma.ReconciliationRunGetPayload<{
  include: { partnerConfig: { select: { id: true; name: true; connectorType: true } } };
}>;

export interface RunView {
  id: number;
  run_date: string;
  partner_config_id: number;
  partner_name: string;
  partner: string;
  status: string;
  source: string;
  source_file: string | null;
  total_paymenthub: number;
  total_partner: number;
  total_amount_paymenthub: number;
  total_amount_partner: number;
  matched_count: number;
  unmatched_paymenthub: number;
  unmatched_partner: number;
  amount_mismatch_count: number;
  unverified_count: number;
  total_discrepancy: number;
  open_discrepancies: number;
  notes: string | null;
  error_message: string | null;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function toRunView(r: RunRow, open = 0): RunView {
  return {
    id: r.id,
    run_date: r.runDate.toISOString().slice(0, 10),
    partner_config_id: r.partnerConfigId,
    partner_name: r.partnerConfig.name,
    partner: r.partnerConfig.connectorType,
    status: r.status,
    source: r.source,
    source_file: r.sourceFile,
    total_paymenthub: r.totalPaymenthub,
    total_partner: r.totalPartner,
    total_amount_paymenthub: Number(r.totalAmountPaymenthub),
    total_amount_partner: Number(r.totalAmountPartner),
    matched_count: r.matchedCount,
    unmatched_paymenthub: r.unmatchedPaymenthub,
    unmatched_partner: r.unmatchedPartner,
    amount_mismatch_count: r.amountMismatchCount,
    unverified_count: r.unverifiedCount,
    total_discrepancy: Number(r.totalDiscrepancy),
    open_discrepancies: open,
    notes: r.notes,
    error_message: r.errorMessage,
    triggered_by: r.triggeredBy,
    started_at: r.startedAt?.toISOString() ?? null,
    completed_at: r.completedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

const RUN_INCLUDE = {
  partnerConfig: { select: { id: true, name: true, connectorType: true } },
} as const;

async function openCounts(runIds: number[]): Promise<Map<number, number>> {
  if (!runIds.length) return new Map();
  const rows = await getPrisma().reconciliationDetail.groupBy({
    by: ["reconciliationRunId"],
    where: {
      reconciliationRunId: { in: runIds },
      matchStatus: { in: DISCREPANCY },
      status: "Open",
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.reconciliationRunId, r._count._all]));
}

export async function getRun(id: number): Promise<RunView> {
  const r = await getPrisma().reconciliationRun.findUnique({ where: { id }, include: RUN_INCLUDE });
  if (!r) throw new ReconError("NOT_FOUND", "Không tìm thấy đợt đối soát");
  return toRunView(r, (await openCounts([id])).get(id) ?? 0);
}

export interface ListRunsInput {
  partnerConfigId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: "Running" | "Completed" | "Failed";
  page: number;
  limit: number;
}

export async function listRuns(input: ListRunsInput) {
  const prisma = getPrisma();
  const where: Prisma.ReconciliationRunWhereInput = {
    partnerConfigId: input.partnerConfigId,
    status: input.status,
  };
  if (input.dateFrom || input.dateTo) {
    where.runDate = {
      ...(input.dateFrom ? { gte: new Date(`${input.dateFrom}T00:00:00Z`) } : {}),
      ...(input.dateTo ? { lte: new Date(`${input.dateTo}T00:00:00Z`) } : {}),
    };
  }
  const [rows, total] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where,
      include: RUN_INCLUDE,
      orderBy: [{ runDate: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.reconciliationRun.count({ where }),
  ]);
  const open = await openCounts(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toRunView(r, open.get(r.id) ?? 0)),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export interface DetailView {
  id: string;
  transaction_id: number | null;
  txn_code: string | null;
  partner_txn_id: string | null;
  partner_ref: string | null;
  match_status: MatchStatus;
  paymenthub_amount: number | null;
  partner_amount: number | null;
  discrepancy_amount: number;
  partner_txn_date: string | null;
  paymenthub_status: string | null;
  partner_status: string | null;
  note: string | null;
  status: "Open" | "Resolved";
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

type DetailRow = Prisma.ReconciliationDetailGetPayload<object>;

export function toDetailView(d: DetailRow): DetailView {
  return {
    id: d.id.toString(),
    transaction_id: d.transactionId,
    txn_code: d.txnCode,
    partner_txn_id: d.partnerTxnId,
    partner_ref: d.partnerRef,
    match_status: d.matchStatus as MatchStatus,
    paymenthub_amount: d.paymenthubAmount === null ? null : Number(d.paymenthubAmount),
    partner_amount: d.partnerAmount === null ? null : Number(d.partnerAmount),
    discrepancy_amount: Number(d.discrepancyAmount),
    partner_txn_date: d.partnerTxnDate?.toISOString() ?? null,
    paymenthub_status: d.paymenthubStatus,
    partner_status: d.partnerStatus,
    note: d.note,
    status: d.status,
    resolution: d.resolution,
    resolved_by: d.resolvedBy,
    resolved_at: d.resolvedAt?.toISOString() ?? null,
  };
}

export interface ListDetailsInput {
  /** "discrepancy" = the 3 discrepancy kinds (default), "all", or one match status */
  match: "discrepancy" | "all" | MatchStatus;
  status?: "Open" | "Resolved";
  search?: string;
  page: number;
  limit: number;
}

export function detailWhere(
  runId: number,
  input: Pick<ListDetailsInput, "match" | "status" | "search">,
): Prisma.ReconciliationDetailWhereInput {
  return {
    reconciliationRunId: runId,
    ...(input.match === "all"
      ? {}
      : input.match === "discrepancy"
        ? { matchStatus: { in: DISCREPANCY } }
        : { matchStatus: input.match }),
    status: input.status,
    ...(input.search
      ? {
          OR: [
            { txnCode: { contains: input.search } },
            { partnerTxnId: { contains: input.search } },
            { partnerRef: { contains: input.search } },
          ],
        }
      : {}),
  };
}

export async function listDetails(runId: number, input: ListDetailsInput) {
  const prisma = getPrisma();
  await getRun(runId);
  const where = detailWhere(runId, input);
  const [rows, total] = await Promise.all([
    prisma.reconciliationDetail.findMany({
      where,
      orderBy: [{ discrepancyAmount: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.reconciliationDetail.count({ where }),
  ]);
  return {
    items: rows.map(toDetailView),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function resolveDetail(
  runId: number,
  detailId: bigint,
  input: { status: "Open" | "Resolved"; resolution?: string },
  username: string,
): Promise<DetailView> {
  const prisma = getPrisma();
  const d = await prisma.reconciliationDetail.findFirst({
    where: { id: detailId, reconciliationRunId: runId },
  });
  if (!d) throw new ReconError("NOT_FOUND", "Không tìm thấy dòng đối soát");
  if (!DISCREPANCY.includes(d.matchStatus as MatchStatus)) {
    throw new ReconError("VALIDATION_ERROR", "Chỉ xử lý được dòng lệch");
  }
  if (input.status === "Resolved" && !input.resolution?.trim()) {
    throw new ReconError("VALIDATION_ERROR", "Nhập cách xử lý khi đánh dấu đã giải quyết");
  }
  const row = await prisma.reconciliationDetail.update({
    where: { id: detailId },
    data:
      input.status === "Resolved"
        ? {
            status: "Resolved",
            resolution: input.resolution!.trim(),
            resolvedBy: username.slice(0, 100),
            resolvedAt: new Date(),
          }
        : { status: "Open", resolvedBy: null, resolvedAt: null },
  });
  return toDetailView(row);
}

/** Every row of a run for the export (bounded by the run's size: one row per transaction). */
export async function allDetails(runId: number): Promise<DetailView[]> {
  const rows = await getPrisma().reconciliationDetail.findMany({
    where: { reconciliationRunId: runId },
    orderBy: [{ matchStatus: "asc" }, { discrepancyAmount: "desc" }, { id: "asc" }],
  });
  return rows.map(toDetailView);
}

/** Partner configs that can be reconciled (UI picker) with whether status queries are possible. */
export async function reconcilablePartners() {
  const rows = await getPrisma().partnerConfig.findMany({
    select: { id: true, name: true, connectorType: true, status: true, environment: true },
    orderBy: [{ connectorType: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    connector_type: r.connectorType,
    status: r.status,
    environment: r.environment,
    api: !!definitionForConnectorType(r.connectorType),
  }));
}
