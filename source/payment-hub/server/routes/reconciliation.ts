import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import {
  RECON_ERROR_STATUS,
  ReconError,
  allDetails,
  createRun,
  executeRun,
  getRun,
  isIsoDate,
  listDetails,
  listRuns,
  reconcilablePartners,
  resolveDetail,
} from "@/server/services/reconciliation.service";
import { reconFileName, reconToPdf, reconToXlsx } from "@/server/services/reconciliationExport";
import { StatementError, parseStatement } from "@/services/reconciliation/statement";
import { enqueueReconRun } from "@/services/reconciliation/queue";

/**
 * Reconciliation admin API (P5.4, API-Design §6.7) under /api/internal/reconciliation:
 *   GET    /                       runs (partner_config_id, date_from, date_to, status, page, limit)
 *   POST   /                       run by status queries {partner_config_id, run_date} → 202, worker
 *   POST   /import                 run from a statement (multipart: file, partner_config_id, run_date)
 *   GET    /partners               partner configs for the picker (api = status queries possible)
 *   GET    /{id}                   run
 *   GET    /{id}/details           rows (match=discrepancy|all|<status>, status, search, page, limit)
 *   PUT    /{id}/details/{detail}  {status: Open|Resolved, resolution}
 *   GET    /{id}/export?format=xlsx|pdf
 * Reconciliation is per partner across merchants: tokens bound to one merchant are refused.
 */

function ok(data: unknown, status = 200, meta?: unknown): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

function auth(req: NextRequest, write = false): AdminContext | Response {
  const a = requireAdmin(req, write ? ADMIN_WRITE_ROLES : undefined);
  if (a instanceof Response) return a;
  if (a.merchantId !== undefined) {
    return err(
      "FORBIDDEN",
      "Đối soát theo đối tác (mọi merchant) — không dành cho tài khoản merchant",
      403,
    );
  }
  return a;
}

function username(req: NextRequest, a: AdminContext): string {
  return req.headers.get("x-user-username") || a.userId;
}

function handleError(e: unknown): Response {
  if (e instanceof ReconError) return err(e.code, e.message, RECON_ERROR_STATUS[e.code]);
  if (e instanceof StatementError) return err("VALIDATION_ERROR", e.message, 400);
  throw e;
}

function intParam(v: string | null, fallback: number, max?: number): number {
  const n = Number(v);
  const val = Number.isSafeInteger(n) && n > 0 ? n : fallback;
  return max ? Math.min(val, max) : val;
}

function runId(id: string): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const runSchema = z.object({
  partner_config_id: z.number().int().positive(),
  run_date: z.string().refine(isIsoDate, "run_date phải có dạng YYYY-MM-DD"),
});

export async function handleListRuns(req: NextRequest): Promise<Response> {
  const a = auth(req);
  if (a instanceof Response) return a;
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  const dateFrom = q.get("date_from") ?? undefined;
  const dateTo = q.get("date_to") ?? undefined;
  if ((dateFrom && !isIsoDate(dateFrom)) || (dateTo && !isIsoDate(dateTo))) {
    return err("VALIDATION_ERROR", "date_from / date_to phải có dạng YYYY-MM-DD", 400);
  }
  const res = await listRuns({
    partnerConfigId: q.get("partner_config_id")
      ? intParam(q.get("partner_config_id"), 0)
      : undefined,
    dateFrom,
    dateTo,
    status:
      status === "Running" || status === "Completed" || status === "Failed" ? status : undefined,
    page: intParam(q.get("page"), 1),
    limit: intParam(q.get("limit"), 20, 100),
  });
  return ok(res.items, 200, res.meta);
}

export async function handlePartners(req: NextRequest): Promise<Response> {
  const a = auth(req);
  if (a instanceof Response) return a;
  return ok(await reconcilablePartners());
}

/** Status-query run: created here, executed by the worker (can take minutes). */
export async function handleCreateRun(req: NextRequest): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, parsed.error.flatten().fieldErrors);
  }
  try {
    const run = await createRun({
      partnerConfigId: parsed.data.partner_config_id,
      runDate: parsed.data.run_date,
      source: "Api",
      triggeredBy: username(req, a),
    });
    try {
      await enqueueReconRun(run.id);
    } catch (e) {
      // Queue down: do not leave a Running run nobody will execute
      await executeRun(run.id).catch(() => {});
      console.error("[recon] enqueue failed, ran inline:", e instanceof Error ? e.message : e);
    }
    return ok(await getRun(run.id), 202);
  } catch (e) {
    return handleError(e);
  }
}

/** Statement import: parsed and matched in the request (10 000 rows take ~1 s). */
export async function handleImport(req: NextRequest): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(
      "VALIDATION_ERROR",
      "Gửi multipart/form-data: file, partner_config_id, run_date",
      400,
    );
  }
  const file = form.get("file");
  const parsed = runSchema.safeParse({
    partner_config_id: Number(form.get("partner_config_id")),
    run_date: String(form.get("run_date") ?? ""),
  });
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, parsed.error.flatten().fieldErrors);
  }
  if (!(file instanceof File)) return err("VALIDATION_ERROR", "Chưa chọn file sao kê", 400);
  try {
    const statement = await parseStatement(file.name, Buffer.from(await file.arrayBuffer()));
    if (statement.records.length === 0) {
      return err("VALIDATION_ERROR", "File không có dòng giao dịch hợp lệ", 400, {
        skipped: statement.skipped.slice(0, 20),
      });
    }
    const run = await createRun({
      partnerConfigId: parsed.data.partner_config_id,
      runDate: parsed.data.run_date,
      source: "File",
      sourceFile: file.name,
      triggeredBy: username(req, a),
    });
    const cols = Object.entries(statement.columns)
      .map(([f, h]) => `${f}=${h}`)
      .join(", ");
    const notes =
      `File ${file.name}: ${statement.rows} dòng, nhận ${statement.records.length}` +
      (statement.skipped.length
        ? `, bỏ qua ${statement.skipped.length} (${statement.skipped
            .slice(0, 5)
            .map((s) => `dòng ${s.row}: ${s.reason}`)
            .join("; ")}${statement.skipped.length > 5 ? "…" : ""})`
        : "") +
      `. Cột: ${cols}`;
    const done = await executeRun(run.id, { records: statement.records, notes });
    return ok({ ...done, skipped: statement.skipped.slice(0, 50) }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function handleGetRun(req: NextRequest, id: string): Promise<Response> {
  const a = auth(req);
  if (a instanceof Response) return a;
  const n = runId(id);
  if (!n) return err("NOT_FOUND", "Không tìm thấy đợt đối soát", 404);
  try {
    return ok(await getRun(n));
  } catch (e) {
    return handleError(e);
  }
}

const MATCHES = [
  "discrepancy",
  "all",
  "Matched",
  "Unmatched_PaymentHub",
  "Unmatched_Partner",
  "Amount_Mismatch",
  "Unverified",
] as const;

export async function handleListDetails(req: NextRequest, id: string): Promise<Response> {
  const a = auth(req);
  if (a instanceof Response) return a;
  const n = runId(id);
  if (!n) return err("NOT_FOUND", "Không tìm thấy đợt đối soát", 404);
  const q = new URL(req.url).searchParams;
  const match = (q.get("match") ??
    q.get("match_status") ??
    "discrepancy") as (typeof MATCHES)[number];
  if (!MATCHES.includes(match)) return err("VALIDATION_ERROR", "match không hợp lệ", 400);
  const status = q.get("status");
  try {
    const res = await listDetails(n, {
      match,
      status: status === "Open" || status === "Resolved" ? status : undefined,
      search: q.get("search")?.trim() || undefined,
      page: intParam(q.get("page"), 1),
      limit: intParam(q.get("limit"), 20, 100),
    });
    return ok(res.items, 200, res.meta);
  } catch (e) {
    return handleError(e);
  }
}

const resolveSchema = z.object({
  status: z.enum(["Open", "Resolved"]),
  resolution: z.string().trim().max(2000).optional(),
});

export async function handleUpdateDetail(
  req: NextRequest,
  id: string,
  detailId: string,
): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const n = runId(id);
  if (!n || !/^\d+$/.test(detailId)) return err("NOT_FOUND", "Không tìm thấy dòng đối soát", 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, parsed.error.flatten().fieldErrors);
  }
  try {
    return ok(await resolveDetail(n, BigInt(detailId), parsed.data, username(req, a)));
  } catch (e) {
    return handleError(e);
  }
}

export async function handleExport(req: NextRequest, id: string): Promise<Response> {
  const a = auth(req);
  if (a instanceof Response) return a;
  const n = runId(id);
  if (!n) return err("NOT_FOUND", "Không tìm thấy đợt đối soát", 404);
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx" && format !== "pdf") {
    return err("VALIDATION_ERROR", "format phải là xlsx hoặc pdf", 400);
  }
  try {
    const run = await getRun(n);
    if (run.status !== "Completed") {
      return err("CONFLICT", `Đợt đối soát đang ở trạng thái ${run.status}`, 409);
    }
    const details = await allDetails(n);
    const buf =
      format === "xlsx" ? await reconToXlsx(run, details) : await reconToPdf(run, details);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="${reconFileName(run, format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
