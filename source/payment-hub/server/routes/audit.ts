import type { NextRequest } from "next/server";
import { parseRange } from "@/lib/report";
import { rateLimit } from "@/lib/rate-limit";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { recordAudit, requestContext } from "@/services/audit/logger";
import {
  auditOptions,
  exportRows,
  getSystemLog,
  getTransactionLog,
  listSystemLogs,
  listTransactionLogs,
  toCsv,
  toXlsx,
  type AuditFilter,
  type AuditKind,
} from "@/server/services/audit.service";

/**
 * Audit log API (P7.2) — `payhub-admin` only (SRS: Audit → Admin), never a merchant-bound token:
 *   GET /api/internal/audit-logs?kind=system|transaction&from&to&action&user&entity_type
 *       &entity_id&result&q&page&limit                       list (≤ 100 / page)
 *   GET /api/internal/audit-logs/{id}?kind=…                  one entry with its raw data
 *   GET /api/internal/audit-logs/options                      filter values
 *   GET /api/internal/audit-logs/export?kind=…&format=csv|xlsx (≤ 50 000 rows; audited itself)
 * There is no write endpoint: entries are appended by the services and the DB refuses changes.
 */

function ok(data: unknown, meta?: unknown): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function err(code: string, message: string, status: number): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function authorize(req: NextRequest): AdminContext | Response {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  if (auth.merchantId !== undefined) {
    return err("FORBIDDEN", "Audit log is not available to merchant users", 403);
  }
  return auth;
}

const TEXT = /^[\p{L}\p{N} ._:@*\-/]{1,100}$/u;

function kindOf(q: URLSearchParams): AuditKind | Response {
  const k = q.get("kind") ?? "system";
  return k === "system" || k === "transaction"
    ? k
    : err("VALIDATION_ERROR", "kind phải là system | transaction", 400);
}

function filterOf(q: URLSearchParams): AuditFilter | Response {
  const r = parseRange(q.get("from"), q.get("to"));
  if (!r.ok) return err("VALIDATION_ERROR", r.message, 400);
  const f: AuditFilter = { range: r.range };
  for (const [param, key] of [
    ["action", "action"],
    ["user", "user"],
    ["entity_type", "entityType"],
    ["entity_id", "entityId"],
    ["q", "q"],
  ] as const) {
    const v = q.get(param)?.trim();
    if (!v) continue;
    if (!TEXT.test(v)) return err("VALIDATION_ERROR", `${param} không hợp lệ`, 400);
    f[key] = v;
  }
  const result = q.get("result");
  if (result) {
    if (result !== "success" && result !== "failure" && result !== "denied") {
      return err("VALIDATION_ERROR", "result phải là success | failure | denied", 400);
    }
    f.result = result;
  }
  return f;
}

export async function handleListAudit(req: NextRequest): Promise<Response> {
  const auth = authorize(req);
  if (auth instanceof Response) return auth;
  const q = req.nextUrl.searchParams;
  const kind = kindOf(q);
  if (kind instanceof Response) return kind;
  const f = filterOf(q);
  if (f instanceof Response) return f;
  const page = Math.max(1, Math.floor(Number(q.get("page")) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.get("limit")) || 50)));
  const { items, total } =
    kind === "system"
      ? await listSystemLogs(f, page, limit)
      : await listTransactionLogs(f, page, limit);
  return ok(items, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function handleGetAudit(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req);
  if (auth instanceof Response) return auth;
  const kind = kindOf(req.nextUrl.searchParams);
  if (kind instanceof Response) return kind;
  if (!/^\d{1,19}$/.test(rawId)) return err("NOT_FOUND", "Không tìm thấy bản ghi", 404);
  const id = BigInt(rawId);
  const row = kind === "system" ? await getSystemLog(id) : await getTransactionLog(id);
  return row ? ok(row) : err("NOT_FOUND", "Không tìm thấy bản ghi", 404);
}

export async function handleAuditOptions(req: NextRequest): Promise<Response> {
  const auth = authorize(req);
  if (auth instanceof Response) return auth;
  return ok(await auditOptions());
}

export async function handleExportAudit(req: NextRequest): Promise<Response> {
  const auth = authorize(req);
  if (auth instanceof Response) return auth;
  const q = req.nextUrl.searchParams;
  const kind = kindOf(q);
  if (kind instanceof Response) return kind;
  const f = filterOf(q);
  if (f instanceof Response) return f;
  const format = q.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") {
    return err("VALIDATION_ERROR", "format phải là csv | xlsx", 400);
  }
  const rl = await rateLimit(`rl:payhub:audit-export:${auth.userId}`, 10, 60).catch(() => ({
    allowed: true,
  }));
  if (!rl.allowed) return err("RATE_LIMITED", "Xuất quá nhiều lần, thử lại sau 1 phút", 429);

  const table = await exportRows(kind, f);
  const file = format === "csv" ? toCsv(table) : await toXlsx(table);
  // Reading the trail out is itself audited.
  await recordAudit({
    ...requestContext(req),
    action: "audit.export",
    entityType: "audit_log",
    entityId: kind,
    newData: {
      kind,
      format,
      rows: table.rows.length,
      truncated: table.truncated,
      filter: { ...f, range: f.range },
    },
    description: `Xuất ${table.rows.length} dòng ${table.title.toLowerCase()} (${format})`,
  });
  const name = `audit-${kind}-${f.range.from}_${f.range.to}.${format}`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type":
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
