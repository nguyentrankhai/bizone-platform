import { z } from "zod";
import type { NextRequest } from "next/server";
import { verifyApiRequest, ApiAuthError } from "@/server/middleware/apiAuth";
import { ADMIN_WRITE_ROLES, requireAdmin } from "@/server/middleware/adminAuth";
import {
  IDEMPOTENCY_KEY_MAX,
  claimIdempotency,
  completeIdempotency,
  idempotencyKeyOf,
  releaseIdempotency,
  requestFingerprint,
} from "@/server/middleware/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { REFUND_ERROR_STATUS, REFUND_REASON_MAX, REFUND_REASON_MIN } from "@/lib/refund";
import {
  RefundError,
  checkRefundStatus,
  getRefundOverview,
  requestRefund,
  resolveRefund,
  type RefundOutcomeView,
} from "@/server/services/refund.service";

/**
 * Refund endpoints (P5.3):
 *  - POST /api/v1/transactions/{id}/refund          merchant (API key + HMAC, Idempotency-Key)
 *  - POST /api/internal/transactions/{id}/refund    admin UI (payhub-admin)
 *  - GET  /api/internal/transactions/{id}/refunds   eligibility + history (admin / viewer)
 *  - POST /api/internal/refunds/{id}/check          ask the PSP now (async PSPs)
 *  - POST /api/internal/refunds/{id}/resolve        manual confirmation of a Processing refund
 *
 * Response: 200 Completed · 202 Processing (PSP still processing / no trustworthy answer — final
 * result via webhook refund.completed or GET transaction) · 502 PARTNER_ERROR when the PSP refused.
 */

/** Refund API: 30 requests / minute (API-Design §3.3) — per API key / admin user. */
const REFUND_RATE_LIMIT = 30;

const refundSchema = z.object({
  amount: z
    .number()
    .int("Số tiền phải là số nguyên (VND)")
    .positive("Số tiền phải lớn hơn 0")
    .nullish(),
  reason: z
    .string()
    .trim()
    .min(REFUND_REASON_MIN, `Lý do hoàn tiền tối thiểu ${REFUND_REASON_MIN} ký tự`)
    .max(REFUND_REASON_MAX, `Lý do hoàn tiền tối đa ${REFUND_REASON_MAX} ký tự`),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const adminRefundSchema = refundSchema.extend({
  note: z.string().trim().max(1000).optional(),
});

const resolveSchema = z.object({
  outcome: z.enum(["Completed", "Failed"]),
  note: z.string().trim().min(3, "Ghi chú xác nhận tối thiểu 3 ký tự").max(1000),
  partner_refund_id: z.string().trim().max(255).optional(),
});

function ok(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json({ success: true, data }, { status, headers });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

function refundErrorResponse(e: RefundError): Response {
  return err(e.code, e.message, REFUND_ERROR_STATUS[e.code], e.details);
}

function clientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

/** HTTP status for a refund outcome; Failed → 502 PARTNER_ERROR (body still carries the refund). */
function outcomeStatus(o: RefundOutcomeView): number {
  if (o.refund.status === "Completed") return 200;
  if (o.refund.status === "Failed") return 502;
  return 202;
}

function outcomeResponse(o: RefundOutcomeView, headers?: HeadersInit): Response {
  const status = outcomeStatus(o);
  if (status === 502) {
    return Response.json(
      {
        success: false,
        error: { code: "PARTNER_ERROR", message: o.refund.message ?? "Đối tác từ chối hoàn tiền" },
        data: o,
      },
      { status, headers },
    );
  }
  return ok(o, status, headers);
}

async function parseJson(raw: string): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false };
  }
}

function validationError(error: z.ZodError): Response {
  const fields = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const first = Object.values(fields).flat().find(Boolean);
  return err("VALIDATION_ERROR", first ?? "Dữ liệu không hợp lệ", 400, fields);
}

// ─── Merchant: POST /api/v1/transactions/{id}/refund ─────────────────────────

export async function handleMerchantRefund(req: NextRequest, id: string): Promise<Response> {
  const rawBody = await req.text();
  let merchant;
  try {
    merchant = await verifyApiRequest(req, rawBody);
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
    throw e;
  }

  const rl = await rateLimit(`rl:payhub:refund:key:${merchant.apiKeyId}`, REFUND_RATE_LIMIT, 60);
  if (!rl.allowed) return err("RATE_LIMITED", "Quá nhiều yêu cầu hoàn tiền, thử lại sau", 429);

  const body = await parseJson(rawBody);
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = refundSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const key = idempotencyKeyOf(req);
  if (key && key.length > IDEMPOTENCY_KEY_MAX) {
    return err(
      "VALIDATION_ERROR",
      `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX} characters`,
      400,
    );
  }
  const url = new URL(req.url);
  const fp = requestFingerprint("POST", url.pathname + url.search, rawBody);
  if (key) {
    const claim = await claimIdempotency("refund", merchant.merchantId, key, fp);
    if (claim.kind === "replay") {
      return outcomeResponse(claim.response as RefundOutcomeView, {
        "Idempotent-Replayed": "true",
      });
    }
    if (claim.kind === "in_progress")
      return err("CONFLICT", "A request with this Idempotency-Key is still being processed", 409);
    if (claim.kind === "mismatch")
      return err("CONFLICT", "Idempotency-Key was already used for a different request", 409);
  }

  try {
    const outcome = await requestRefund(
      id,
      { amount: parsed.data.amount, reason: parsed.data.reason },
      {
        channel: "Merchant",
        requestedBy: `merchant:${merchant.merchantId}`,
        merchantId: merchant.merchantId,
        ipAddress: clientIp(req),
      },
    );
    if (key) {
      // A refused refund moved no money — the merchant may retry with the same key.
      if (outcome.refund.status === "Failed") {
        await releaseIdempotency("refund", merchant.merchantId, key);
      } else {
        await completeIdempotency(
          "refund",
          merchant.merchantId,
          key,
          fp,
          outcomeStatus(outcome),
          outcome,
        );
      }
    }
    return outcomeResponse(outcome);
  } catch (e) {
    if (key) await releaseIdempotency("refund", merchant.merchantId, key);
    if (e instanceof RefundError) return refundErrorResponse(e);
    throw e;
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

function adminUsername(req: NextRequest, userId: string): string {
  return req.headers.get("x-user-username") || userId;
}

export async function handleAdminRefund(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`rl:payhub:refund:user:${auth.userId}`, REFUND_RATE_LIMIT, 60);
  if (!rl.allowed) return err("RATE_LIMITED", "Quá nhiều yêu cầu hoàn tiền, thử lại sau", 429);

  const body = await parseJson(await req.text());
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = adminRefundSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const outcome = await requestRefund(
      id,
      { amount: parsed.data.amount, reason: parsed.data.reason, note: parsed.data.note },
      {
        channel: "Admin",
        requestedBy: adminUsername(req, auth.userId),
        merchantId: auth.merchantId,
        ipAddress: clientIp(req),
      },
    );
    return outcomeResponse(outcome);
  } catch (e) {
    if (e instanceof RefundError) return refundErrorResponse(e);
    throw e;
  }
}

export async function handleAdminRefundOverview(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;
  const overview = await getRefundOverview(id, auth.merchantId);
  if (!overview) return err("NOT_FOUND", "Không tìm thấy giao dịch", 404);
  return ok(overview);
}

function parseRefundId(id: string): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function handleAdminRefundCheck(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  const refundId = parseRefundId(id);
  if (!refundId) return err("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền", 404);
  try {
    const outcome = await checkRefundStatus(
      refundId,
      adminUsername(req, auth.userId),
      auth.merchantId,
    );
    return ok(outcome);
  } catch (e) {
    if (e instanceof RefundError) return refundErrorResponse(e);
    throw e;
  }
}

export async function handleAdminRefundResolve(req: NextRequest, id: string): Promise<Response> {
  const auth = requireAdmin(req, ADMIN_WRITE_ROLES);
  if (auth instanceof Response) return auth;
  const refundId = parseRefundId(id);
  if (!refundId) return err("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền", 404);
  const body = await parseJson(await req.text());
  if (!body.ok) return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  const parsed = resolveSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const outcome = await resolveRefund(
      refundId,
      {
        outcome: parsed.data.outcome,
        note: parsed.data.note,
        partnerRefundId: parsed.data.partner_refund_id,
      },
      { username: adminUsername(req, auth.userId), merchantId: auth.merchantId },
    );
    return ok(outcome);
  } catch (e) {
    if (e instanceof RefundError) return refundErrorResponse(e);
    throw e;
  }
}
