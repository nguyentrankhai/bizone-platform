import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import {
  COMPARE_MODES,
  GROUP_BYS,
  MAX_EXPORT_ROWS,
  REPORT_FORMATS,
  REPORT_TYPES,
  defaultGroupBy,
  parseRange,
  parseStatuses,
  paymentMethodLabel,
  reportFileName,
  type CompareMode,
  type DateRange,
  type GroupBy,
  type ReconFilters,
  type ReportFormat,
  type ReportType,
  type TxnFilters,
} from "@/lib/report";
import { isPaymentMethod } from "@/services/routing/routeMap";
import {
  reconciliationDiscrepancies,
  reconciliationReport,
  reportOptions,
  revenueReport,
  transactionList,
  transactionReport,
} from "@/server/services/report.service";
import {
  CONTENT_TYPES,
  reconciliationDoc,
  renderDoc,
  revenueDoc,
  transactionDoc,
  type ReportDoc,
} from "@/server/services/reportExport";

/**
 * Reports admin API (P5.5, API-Design §6.9) under /api/internal/reports — read roles
 * payhub-admin | payhub-viewer:
 *   GET /options                       filter values (partners, merchants, payment methods)
 *   GET /transactions                  from, to, group_by=day|week|month, status, partner,
 *                                      payment_method, merchant_id
 *   GET /revenue                       from, to, compare=previous|year, partner, merchant_id
 *   GET /reconciliation                from, to, partner, partner_config_id
 *   GET /reconciliation/discrepancies  … + status=Open|Resolved, search, page, limit
 *   GET /export?type=&format=xlsx|pdf|csv&<filters of that report>   file download
 * Dates are Vietnam days (YYYY-MM-DD, inclusive, ≤ 366 days; default: last 7 days).
 * A token bound to one merchant only sees that merchant; the reconciliation report (per partner,
 * across merchants) is refused to it.
 */

function ok(data: unknown, meta?: unknown): Response {
  return Response.json(
    { success: true, data, ...(meta ? { meta } : {}) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function err(code: string, message: string, status: number): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

const bad = (message: string) => err("VALIDATION_ERROR", message, 400);

function positiveInt(v: string | null): number | null | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function rangeOf(q: URLSearchParams): DateRange | Response {
  const r = parseRange(q.get("from"), q.get("to"));
  return r.ok ? r.range : bad(r.message);
}

function partnerOf(q: URLSearchParams): string | undefined | Response {
  const p = q.get("partner")?.trim();
  if (!p) return undefined;
  return /^[A-Za-z0-9_-]{1,50}$/.test(p) ? p : bad("partner không hợp lệ");
}

/** Merchant filter: forced to the token's merchant when the token is bound to one. */
function merchantOf(q: URLSearchParams, a: AdminContext): number | undefined | Response {
  const m = positiveInt(q.get("merchant_id"));
  if (m === null) return bad("merchant_id không hợp lệ");
  if (a.merchantId !== undefined) {
    if (m !== undefined && m !== a.merchantId) {
      return err("FORBIDDEN", "Không xem được dữ liệu của merchant khác", 403);
    }
    return a.merchantId;
  }
  return m;
}

interface TxnQuery {
  range: DateRange;
  groupBy: GroupBy;
  filters: TxnFilters;
}

function txnQuery(q: URLSearchParams, a: AdminContext): TxnQuery | Response {
  const range = rangeOf(q);
  if (range instanceof Response) return range;
  const g = q.get("group_by") ?? q.get("groupBy");
  if (g && !(GROUP_BYS as readonly string[]).includes(g)) {
    return bad("group_by phải là day | week | month");
  }
  const statuses = parseStatuses(q.get("status"));
  if (statuses === null) return bad("status không hợp lệ");
  const partner = partnerOf(q);
  if (partner instanceof Response) return partner;
  const method = q.get("payment_method")?.trim() || undefined;
  if (method && !isPaymentMethod(method)) return bad("payment_method không hợp lệ");
  const merchantId = merchantOf(q, a);
  if (merchantId instanceof Response) return merchantId;
  return {
    range,
    groupBy: (g as GroupBy | null) ?? defaultGroupBy(range),
    filters: { statuses, partner, paymentMethod: method, merchantId },
  };
}

interface RevenueQuery {
  range: DateRange;
  compare: CompareMode;
  filters: { partner?: string; merchantId?: number };
}

function revenueQuery(q: URLSearchParams, a: AdminContext): RevenueQuery | Response {
  const range = rangeOf(q);
  if (range instanceof Response) return range;
  const compare = q.get("compare") ?? "previous";
  if (!(COMPARE_MODES as readonly string[]).includes(compare)) {
    return bad("compare phải là previous | year");
  }
  const partner = partnerOf(q);
  if (partner instanceof Response) return partner;
  const merchantId = merchantOf(q, a);
  if (merchantId instanceof Response) return merchantId;
  return { range, compare: compare as CompareMode, filters: { partner, merchantId } };
}

function reconQuery(
  q: URLSearchParams,
  a: AdminContext,
): { range: DateRange; filters: ReconFilters } | Response {
  if (a.merchantId !== undefined) {
    return err(
      "FORBIDDEN",
      "Báo cáo đối soát theo đối tác (mọi merchant) — không dành cho tài khoản merchant",
      403,
    );
  }
  const range = rangeOf(q);
  if (range instanceof Response) return range;
  const partner = partnerOf(q);
  if (partner instanceof Response) return partner;
  const pcId = positiveInt(q.get("partner_config_id"));
  if (pcId === null) return bad("partner_config_id không hợp lệ");
  return { range, filters: { partner, partnerConfigId: pcId } };
}

function query(req: NextRequest): URLSearchParams {
  return new URL(req.url).searchParams;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleOptions(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  return ok(await reportOptions(a.merchantId));
}

export async function handleTransactions(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  const p = txnQuery(query(req), a);
  if (p instanceof Response) return p;
  return ok(await transactionReport(p.range, p.groupBy, p.filters));
}

export async function handleRevenue(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  const p = revenueQuery(query(req), a);
  if (p instanceof Response) return p;
  return ok(await revenueReport(p.range, p.compare, p.filters));
}

export async function handleReconciliation(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  const p = reconQuery(query(req), a);
  if (p instanceof Response) return p;
  return ok(await reconciliationReport(p.range, p.filters));
}

export async function handleDiscrepancies(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  const q = query(req);
  const p = reconQuery(q, a);
  if (p instanceof Response) return p;
  const status = q.get("status");
  if (status && status !== "Open" && status !== "Resolved") {
    return bad("status phải là Open | Resolved");
  }
  const page = positiveInt(q.get("page")) || 1;
  const limit = Math.min(positiveInt(q.get("limit")) || 20, 100);
  const report = await reconciliationReport(p.range, p.filters);
  const res = await reconciliationDiscrepancies(
    report.days.map((d) => d.runId),
    {
      status: (status as "Open" | "Resolved" | null) ?? undefined,
      search: q.get("search")?.trim().slice(0, 100) || undefined,
      page,
      limit,
    },
  );
  return ok(res.items, res.meta);
}

// ─── Export ───────────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
  paid: "Thành công",
  failed: "Thất bại / hết hạn",
  pending: "Đang chờ",
};

async function filterText(parts: {
  status?: string | null;
  partner?: string;
  paymentMethod?: string;
  merchantId?: number;
  partnerConfigId?: number;
}): Promise<string> {
  const out: string[] = [];
  if (parts.status) {
    out.push(
      `Trạng thái: ${parts.status
        .split(",")
        .map((s) => STATUS_TEXT[s.trim()] ?? s.trim())
        .join(", ")}`,
    );
  }
  if (parts.partner) out.push(`Đối tác: ${parts.partner}`);
  if (parts.partnerConfigId) {
    const pc = await getPrisma().partnerConfig.findUnique({
      where: { id: parts.partnerConfigId },
      select: { name: true },
    });
    out.push(`Cấu hình: ${pc?.name ?? `#${parts.partnerConfigId}`}`);
  }
  if (parts.paymentMethod) out.push(`Phương thức: ${paymentMethodLabel(parts.paymentMethod)}`);
  if (parts.merchantId) {
    const m = await getPrisma().merchant.findUnique({
      where: { id: parts.merchantId },
      select: { code: true, name: true },
    });
    out.push(`Merchant: ${m ? `${m.code} — ${m.name}` : `#${parts.merchantId}`}`);
  }
  return out.length ? out.join("; ") : "Tất cả";
}

export async function handleExport(req: NextRequest): Promise<Response> {
  const a = requireAdmin(req);
  if (a instanceof Response) return a;
  const q = query(req);
  const type = q.get("type") as ReportType | null;
  const format = (q.get("format") ?? "xlsx") as ReportFormat;
  if (!type || !REPORT_TYPES.includes(type)) {
    return bad("type phải là transactions | revenue | reconciliation");
  }
  if (!REPORT_FORMATS.includes(format)) return bad("format phải là xlsx | pdf | csv");

  let doc: ReportDoc;
  let range: DateRange;
  if (type === "transactions") {
    const p = txnQuery(q, a);
    if (p instanceof Response) return p;
    range = p.range;
    const [report, list, text] = await Promise.all([
      transactionReport(p.range, p.groupBy, p.filters),
      // The PDF holds the summary + per-period table only
      format === "pdf"
        ? Promise.resolve({ rows: [], truncated: false })
        : transactionList(p.range, p.filters),
      filterText({ ...p.filters, status: q.get("status") }),
    ]);
    doc = transactionDoc(report, list, text);
  } else if (type === "revenue") {
    const p = revenueQuery(q, a);
    if (p instanceof Response) return p;
    range = p.range;
    const [report, text] = await Promise.all([
      revenueReport(p.range, p.compare, p.filters),
      filterText(p.filters),
    ]);
    doc = revenueDoc(report, text);
  } else {
    const p = reconQuery(q, a);
    if (p instanceof Response) return p;
    range = p.range;
    const report = await reconciliationReport(p.range, p.filters);
    const [details, text] = await Promise.all([
      format === "csv"
        ? Promise.resolve({ items: [], meta: { total: 0 } })
        : reconciliationDiscrepancies(
            report.days.map((d) => d.runId),
            { page: 1, limit: MAX_EXPORT_ROWS },
          ),
      filterText(p.filters),
    ]);
    doc = reconciliationDoc(report, { rows: details.items, total: details.meta.total }, text);
  }

  const buf = await renderDoc(doc, format);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${reportFileName(type, range, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
