import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { rateLimit } from "@/lib/rate-limit";
import { isIsoDate } from "@/lib/report";
import {
  ATTACHMENT_MAX_BYTES,
  DISPUTE_DESCRIPTION_MAX,
  DISPUTE_ERROR_STATUS,
  DISPUTE_NOTE_MAX,
  DISPUTE_PARTNER_REF_MAX,
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  DISPUTE_STATUSES,
} from "@/lib/dispute";
import { StorageError } from "@/lib/storage";
import {
  DisputeError,
  addAttachment,
  checkDispute,
  createDispute,
  getAttachmentFile,
  getDispute,
  getTxnDisputeOverview,
  listDisputes,
  removeAttachment,
  submitDispute,
  updateDispute,
  type DisputeActor,
} from "@/server/services/dispute.service";

/**
 * Dispute endpoints (P5.6, API-Design §6.8 — implemented under /api/internal like the other admin
 * APIs). Reads: payhub-admin | payhub-viewer; writes: payhub-admin. A token bound to a merchant only
 * sees / acts on that merchant's transactions.
 *
 *  GET    /api/internal/disputes                          list (status, search, from, to, partner…)
 *  POST   /api/internal/disputes                          create { transaction_id, reason, description?, submit? }
 *  GET    /api/internal/disputes/{id}                     detail (attachments + timeline)
 *  PUT    /api/internal/disputes/{id}                     { status, resolution?, note?, from_partner?, partner_ref? }
 *  POST   /api/internal/disputes/{id}/submit              { mode: auto | manual, partner_ref?, note? }
 *  POST   /api/internal/disputes/{id}/check               ask the partner's dispute API
 *  POST   /api/internal/disputes/{id}/attachments         multipart, field `file` (one file ≤ 5 MB)
 *  GET    /api/internal/disputes/{id}/attachments/{aid}   download
 *  DELETE /api/internal/disputes/{id}/attachments/{aid}
 *  GET    /api/internal/transactions/{id}/disputes        eligibility + disputes of a transaction
 */

const WRITE_RATE_LIMIT = 60;

function ok(data: unknown, status = 200, extra?: Record<string, unknown>): Response {
  return Response.json({ success: true, data, ...extra }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

function fail(e: unknown): Response {
  if (e instanceof DisputeError)
    return err(e.code, e.message, DISPUTE_ERROR_STATUS[e.code], e.details);
  if (e instanceof StorageError) {
    console.error(`[dispute] storage: ${e.message}`);
    return err("STORAGE_ERROR", "Kho lưu trữ tệp không khả dụng — thử lại sau", 503);
  }
  throw e;
}

function validationError(error: z.ZodError): Response {
  const fields = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const first = Object.values(fields).flat().find(Boolean) ?? error.issues[0]?.message;
  return err("VALIDATION_ERROR", first ?? "Dữ liệu không hợp lệ", 400, fields);
}

async function readJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const raw = await req.text();
    return { ok: true, value: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false };
  }
}

function actorOf(req: NextRequest, auth: AdminContext): DisputeActor {
  return {
    username: req.headers.get("x-user-username") || auth.userId,
    email: req.headers.get("x-user-email"),
    merchantId: auth.merchantId,
  };
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function writer(req: NextRequest): Promise<AdminContext | Response> {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`rl:payhub:dispute:user:${auth.userId}`, WRITE_RATE_LIMIT, 60);
  if (!rl.allowed) return err("RATE_LIMITED", "Quá nhiều thao tác tra soát, thử lại sau", 429);
  return auth;
}

const notFound = () => err("NOT_FOUND", "Không tìm thấy yêu cầu tra soát", 404);

// ─── List / create ────────────────────────────────────────────────────────────

const listSchema = z.object({
  status: z.enum([...DISPUTE_STATUSES, "open"]).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.string().refine(isIsoDate, "Ngày bắt đầu không hợp lệ (YYYY-MM-DD)").optional(),
  to: z.string().refine(isIsoDate, "Ngày kết thúc không hợp lệ (YYYY-MM-DD)").optional(),
  partner: z.enum(["VNPay", "MoMo", "ZaloPay", "VietQR"]).optional(),
  merchant_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function handleListDisputes(req: NextRequest): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const q = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ""));
  const parsed = listSchema.safeParse(q);
  if (!parsed.success) return validationError(parsed.error);
  const f = parsed.data;
  if (f.from && f.to && f.from > f.to) {
    return err("VALIDATION_ERROR", "Ngày bắt đầu phải trước ngày kết thúc", 400);
  }
  if (auth.merchantId !== undefined && f.merchant_id && f.merchant_id !== auth.merchantId) {
    return err("FORBIDDEN", "Token chỉ được xem merchant của mình", 403);
  }
  const result = await listDisputes(
    {
      status: f.status,
      search: f.search,
      from: f.from,
      to: f.to,
      partner: f.partner,
      merchantId: f.merchant_id,
      page: f.page,
      limit: f.limit,
    },
    { merchantId: auth.merchantId },
  );
  return ok(result.items, 200, { meta: { ...result.meta, counts: result.counts } });
}

const createSchema = z.object({
  transaction_id: z.union([
    z.number().int().positive(),
    z.string().trim().min(1, "Thiếu mã giao dịch").max(100),
  ]),
  reason: z
    .string({ error: "Lý do tra soát là bắt buộc" })
    .trim()
    .min(DISPUTE_REASON_MIN, `Lý do tra soát tối thiểu ${DISPUTE_REASON_MIN} ký tự`)
    .max(DISPUTE_REASON_MAX, `Lý do tra soát tối đa ${DISPUTE_REASON_MAX} ký tự`),
  description: z
    .string()
    .trim()
    .max(DISPUTE_DESCRIPTION_MAX, `Nội dung tối đa ${DISPUTE_DESCRIPTION_MAX} ký tự`)
    .nullish(),
  submit: z.boolean().optional(),
});

export async function handleCreateDispute(req: NextRequest): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req);
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const r = await createDispute(
      parsed.data.transaction_id,
      {
        reason: parsed.data.reason,
        description: parsed.data.description,
        submit: parsed.data.submit,
      },
      actorOf(req, auth),
    );
    return ok(r.dispute, 201, { submit: r.submit, submitError: r.submitError });
  } catch (e) {
    return fail(e);
  }
}

// ─── Detail / update ──────────────────────────────────────────────────────────

export async function handleGetDispute(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  if (!n) return notFound();
  try {
    return ok(await getDispute(n, { merchantId: auth.merchantId }));
  } catch (e) {
    return fail(e);
  }
}

const updateSchema = z.object({
  status: z.enum(["Processing", "Resolved", "Rejected"], {
    error: "Trạng thái phải là Processing, Resolved hoặc Rejected",
  }),
  resolution: z.string().trim().max(DISPUTE_DESCRIPTION_MAX).nullish(),
  note: z.string().trim().max(DISPUTE_NOTE_MAX).nullish(),
  from_partner: z.boolean().optional(),
  partner_ref: z.string().trim().max(DISPUTE_PARTNER_REF_MAX).nullish(),
});

export async function handleUpdateDispute(req: NextRequest, id: string): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  if (!n) return notFound();
  const body = await readJson(req);
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = updateSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const d = await updateDispute(
      n,
      {
        status: parsed.data.status,
        resolution: parsed.data.resolution,
        note: parsed.data.note,
        fromPartner: parsed.data.from_partner,
        partnerRef: parsed.data.partner_ref,
      },
      actorOf(req, auth),
    );
    return ok(d);
  } catch (e) {
    return fail(e);
  }
}

const submitSchema = z.object({
  mode: z.enum(["auto", "manual"]).default("auto"),
  partner_ref: z.string().trim().max(DISPUTE_PARTNER_REF_MAX).nullish(),
  note: z.string().trim().max(DISPUTE_NOTE_MAX).nullish(),
});

export async function handleSubmitDispute(req: NextRequest, id: string): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  if (!n) return notFound();
  const body = await readJson(req);
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = submitSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const r = await submitDispute(
      n,
      { mode: parsed.data.mode, partnerRef: parsed.data.partner_ref, note: parsed.data.note },
      actorOf(req, auth),
    );
    return ok(r.dispute, 200, { submit: r.submit });
  } catch (e) {
    return fail(e);
  }
}

export async function handleCheckDispute(req: NextRequest, id: string): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  if (!n) return notFound();
  try {
    return ok(await checkDispute(n, actorOf(req, auth)));
  } catch (e) {
    return fail(e);
  }
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function handleUploadAttachment(req: NextRequest, id: string): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  if (!n) return notFound();
  const declared = Number(req.headers.get("content-length") ?? 0);
  // multipart overhead on top of the 5 MB file; the proxy buffers at most 10 MB
  if (declared > ATTACHMENT_MAX_BYTES + 64 * 1024) {
    return err("PAYLOAD_TOO_LARGE", `Tệp vượt quá ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`, 413);
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("VALIDATION_ERROR", "Cần gửi multipart/form-data có trường file", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return err("VALIDATION_ERROR", "Cần gửi multipart/form-data có trường file", 400);
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return err("PAYLOAD_TOO_LARGE", `Tệp vượt quá ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`, 413);
  }
  try {
    const a = await addAttachment(
      n,
      { name: file.name, data: Buffer.from(await file.arrayBuffer()) },
      actorOf(req, auth),
    );
    return ok(a, 201);
  } catch (e) {
    return fail(e);
  }
}

export async function handleDownloadAttachment(
  req: NextRequest,
  id: string,
  attachmentId: string,
): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  const a = parseId(attachmentId);
  if (!n || !a) return err("NOT_FOUND", "Không tìm thấy tệp đính kèm", 404);
  try {
    const f = await getAttachmentFile(n, a, { merchantId: auth.merchantId });
    const ascii = f.fileName
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "_");
    return new Response(new Uint8Array(f.body), {
      headers: {
        "Content-Type": f.fileType ?? "application/octet-stream",
        "Content-Length": String(f.body.length),
        "Content-Disposition": `attachment; filename="${ascii || "tep-dinh-kem"}"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function handleDeleteAttachment(
  req: NextRequest,
  id: string,
  attachmentId: string,
): Promise<Response> {
  const auth = await writer(req);
  if (auth instanceof Response) return auth;
  const n = parseId(id);
  const a = parseId(attachmentId);
  if (!n || !a) return err("NOT_FOUND", "Không tìm thấy tệp đính kèm", 404);
  try {
    await removeAttachment(n, a, actorOf(req, auth));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}

// ─── Transaction overview ─────────────────────────────────────────────────────

export async function handleTxnDisputes(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const overview = await getTxnDisputeOverview(id, { merchantId: auth.merchantId });
  if (!overview) return err("NOT_FOUND", "Không tìm thấy giao dịch", 404);
  return ok(overview);
}
