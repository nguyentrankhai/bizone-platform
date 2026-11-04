import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { rateLimit } from "@/lib/rate-limit";
import {
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_INTERVALS,
  WEBHOOK_EVENT_CODES,
} from "@/lib/webhook-events";
import {
  WebhookError,
  createWebhookConfig,
  deleteWebhookConfig,
  getWebhookConfig,
  getWebhookLog,
  listWebhookConfigs,
  listWebhookLogs,
  pingWebhook,
  replayWebhook,
  rotateWebhookSecret,
  setWebhookStatus,
  updateWebhookConfig,
  webhookStats,
  type Scope,
} from "@/server/services/webhook.service";

/**
 * Admin webhook API (Keycloak JWT via proxy.ts). Read: payhub-admin | payhub-viewer;
 * write/ping/replay: payhub-admin. A token with a merchant_id claim only sees that merchant.
 *
 *   GET    /api/internal/webhooks                 endpoints (+ per-endpoint delivery counts)
 *   POST   /api/internal/webhooks                 create → secret returned once
 *   GET    /api/internal/webhooks/stats?hours=24  dashboard numbers
 *   GET|PUT|DELETE /api/internal/webhooks/{id}
 *   PUT    /api/internal/webhooks/{id}/status     { status: Active | Inactive }
 *   POST   /api/internal/webhooks/{id}/rotate-secret
 *   POST   /api/internal/webhooks/{id}/test       ping (10/min)
 *   GET    /api/internal/webhook-logs             history (filters, paginated)
 *   GET    /api/internal/webhook-logs/{id}        request/response detail
 *   POST   /api/internal/webhook-logs/{id}/replay re-send now (30/min)
 */

const PING_LIMIT = 10; // API-Design: "Webhook Test" 10 req/min
const REPLAY_LIMIT = 30;

const urlSchema = z
  .string()
  .trim()
  .url("URL không hợp lệ")
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "URL phải bắt đầu bằng http:// hoặc https://");

const configBody = z.object({
  url: urlSchema,
  events: z
    .array(z.enum(WEBHOOK_EVENT_CODES))
    .min(1, "Chọn ít nhất 1 sự kiện")
    .transform((e) => [...new Set(e)]),
  retry_count: z.number().int().min(0).max(10).default(DEFAULT_RETRY_COUNT),
  retry_intervals: z
    .array(z.number().int().min(1).max(86_400))
    .min(1)
    .max(10)
    .default(DEFAULT_RETRY_INTERVALS),
  timeout_ms: z.number().int().min(1000).max(60_000).default(30_000),
});

const createBody = configBody.extend({ merchant_id: z.number().int().positive() });

function ok(data: unknown, status = 200, meta?: unknown): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

const STATUS_OF: Record<WebhookError["code"], number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
};

function auth(req: NextRequest, write: boolean): (AdminContext & Scope) | Response {
  return write ? requireAdmin(req, ADMIN_WRITE_ROLES) : requireAdmin(req);
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WebhookError) return err(e.code, e.message, STATUS_OF[e.code]);
    throw e;
  }
}

async function json(req: NextRequest): Promise<unknown | Response> {
  try {
    return await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
}

function invalid(e: z.ZodError): Response {
  return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, e.flatten().fieldErrors);
}

function intId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function limited(key: string, limit: number): Promise<Response | null> {
  const rl = await rateLimit(key, limit, 60);
  return rl.allowed ? null : err("RATE_LIMITED", `Tối đa ${limit} lần/phút`, 429);
}

const notFound = () => err("NOT_FOUND", "Không tìm thấy", 404);

// ─── Endpoints ────────────────────────────────────────────────────────────────

export async function handleListWebhooks(req: NextRequest): Promise<Response> {
  const a = auth(req, false);
  if (a instanceof Response) return a;
  const status = req.nextUrl.searchParams.get("status");
  return ok(
    await listWebhookConfigs(a, {
      status: status === "Active" || status === "Inactive" ? status : undefined,
    }),
  );
}

export async function handleCreateWebhook(req: NextRequest): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const body = await json(req);
  if (body instanceof Response) return body;
  const parsed = createBody.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  return guard(async () => {
    const { config, secret } = await createWebhookConfig(
      {
        merchantId: d.merchant_id,
        url: d.url,
        events: d.events,
        retryCount: d.retry_count,
        retryIntervals: d.retry_intervals,
        timeoutMs: d.timeout_ms,
      },
      a,
    );
    return ok({ ...config, secret }, 201);
  });
}

export async function handleWebhookStats(req: NextRequest): Promise<Response> {
  const a = auth(req, false);
  if (a instanceof Response) return a;
  const hours = Math.min(24 * 30, Math.max(1, Number(req.nextUrl.searchParams.get("hours")) || 24));
  return ok(await webhookStats(hours, a));
}

export async function handleGetWebhook(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, false);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  return guard(async () => ok(await getWebhookConfig(id, a)));
}

export async function handleUpdateWebhook(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  const body = await json(req);
  if (body instanceof Response) return body;
  const parsed = configBody.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  return guard(async () =>
    ok(
      await updateWebhookConfig(
        id,
        {
          url: d.url,
          events: d.events,
          retryCount: d.retry_count,
          retryIntervals: d.retry_intervals,
          timeoutMs: d.timeout_ms,
        },
        a,
      ),
    ),
  );
}

export async function handleDeleteWebhook(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  return guard(async () => {
    await deleteWebhookConfig(id, a);
    return ok({ id, deleted: true });
  });
}

export async function handleWebhookStatus(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  const body = await json(req);
  if (body instanceof Response) return body;
  const parsed = z.object({ status: z.enum(["Active", "Inactive"]) }).safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  return guard(async () => ok(await setWebhookStatus(id, parsed.data.status, a)));
}

export async function handleRotateSecret(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  return guard(async () => {
    const { config, secret } = await rotateWebhookSecret(id, a);
    return ok({ ...config, secret });
  });
}

export async function handlePingWebhook(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = intId(raw);
  if (!id) return notFound();
  const blocked = await limited(`rl:payhub:webhook-ping:${a.userId}`, PING_LIMIT);
  if (blocked) return blocked;
  return guard(async () => ok(await pingWebhook(id, a)));
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function date(v: string | null, endOfDay = false): Date | undefined {
  if (!v) return undefined;
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? "23:59:59" : "00:00:00"}+07:00` : v,
  );
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function handleListWebhookLogs(req: NextRequest): Promise<Response> {
  const a = auth(req, false);
  if (a instanceof Response) return a;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const event = sp.get("event");
  const result = await listWebhookLogs(
    {
      webhookConfigId: intId(sp.get("webhook_config_id") ?? "") ?? undefined,
      transaction: sp.get("transaction") ?? undefined,
      event: event && event.length <= 50 ? event : undefined,
      status: status === "Success" || status === "Failed" ? status : undefined,
      url: sp.get("url")?.slice(0, 200) || undefined,
      dateFrom: date(sp.get("date_from")),
      dateTo: date(sp.get("date_to"), true),
      page: Math.max(1, Number(sp.get("page")) || 1),
      limit: Math.min(100, Math.max(1, Number(sp.get("limit")) || 20)),
    },
    a,
  );
  return ok(result.items, 200, result.meta);
}

function bigId(raw: string): bigint | null {
  return /^\d{1,18}$/.test(raw) && raw !== "0" ? BigInt(raw) : null;
}

export async function handleGetWebhookLog(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, false);
  if (a instanceof Response) return a;
  const id = bigId(raw);
  if (!id) return notFound();
  return guard(async () => ok(await getWebhookLog(id, a)));
}

export async function handleReplayWebhook(req: NextRequest, raw: string): Promise<Response> {
  const a = auth(req, true);
  if (a instanceof Response) return a;
  const id = bigId(raw);
  if (!id) return notFound();
  const blocked = await limited(`rl:payhub:webhook-replay:${a.userId}`, REPLAY_LIMIT);
  if (blocked) return blocked;
  return guard(async () => ok(await replayWebhook(id, a)));
}
