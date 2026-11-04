import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { PARTNER_TYPE_CODES, type PartnerEnv, type PartnerStatus } from "@/lib/partner-types";
import {
  PartnerError,
  createPartner,
  getPartner,
  listPartnerLogs,
  listPartners,
  setPartnerStatus,
  testPartner,
  updatePartner,
  type Actor,
} from "@/server/services/partner.service";

/**
 * Admin API for partner (PSP) configs — Keycloak JWT (proxy.ts) + role:
 *   GET    /api/internal/partners               list (status, environment, connector_type)
 *   POST   /api/internal/partners               create (always Inactive)
 *   GET    /api/internal/partners/{id}          detail (secrets masked)
 *   PUT    /api/internal/partners/{id}          update (blank api_key/secret_key = keep)
 *   POST   /api/internal/partners/{id}/test     test connection
 *   PUT    /api/internal/partners/{id}/status   { status: Active | Inactive }
 *   GET    /api/internal/partners/{id}/logs     change history
 * Read: payhub-admin | payhub-viewer. Write: payhub-admin. Partner configs are global, so tokens
 * bound to one merchant (merchant_id claim) are refused.
 */

const STATUSES = ["Active", "Inactive", "Error"] as const;
const ENVS = ["Sandbox", "Production"] as const;

const optionalUrl = z
  .union([z.string().trim().url("URL không hợp lệ").max(500), z.literal(""), z.null()])
  .optional();

const partnerSchema = z.object({
  connector_type: z.enum(PARTNER_TYPE_CODES as [string, ...string[]]),
  name: z.string().trim().min(1, "Tên hiển thị là bắt buộc").max(255),
  merchant_code: z.string().trim().max(255).default(""),
  environment: z.enum(ENVS),
  api_key: z.string().max(400).optional(),
  secret_key: z.string().max(400).optional(),
  endpoint_sandbox: optionalUrl,
  endpoint_production: optionalUrl,
  callback_url: optionalUrl,
  webhook_url: optionalUrl,
  timeout: z.number().int().min(1000).max(120_000).default(30_000),
  retry_policy: z
    .object({
      max_retries: z.number().int().min(0).max(10),
      backoff_ms: z.number().int().min(0).max(600_000),
    })
    .default({ max_retries: 3, backoff_ms: 1000 }),
});

const statusSchema = z.object({ status: z.enum(["Active", "Inactive"]) });

function ok(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

const PARTNER_ERROR_STATUS: Record<PartnerError["code"], number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
};

function authorize(req: NextRequest, write: boolean): AdminContext | Response {
  const auth = write ? requireAdmin(req, ADMIN_WRITE_ROLES) : requireAdmin(req);
  if (auth instanceof Response) return auth;
  if (auth.merchantId !== undefined) {
    return err("FORBIDDEN", "Partner configuration is not available to merchant users", 403);
  }
  return auth;
}

function actorOf(req: NextRequest): Actor {
  return {
    username: req.headers.get("x-user-username") || req.headers.get("x-user-id") || "unknown",
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined,
  };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PartnerError) return err(e.code, e.message, PARTNER_ERROR_STATUS[e.code]);
    throw e;
  }
}

async function readJson(req: NextRequest): Promise<unknown | Response> {
  try {
    return await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
}

function toInput(d: z.infer<typeof partnerSchema>) {
  return {
    connectorType: d.connector_type,
    name: d.name,
    merchantCode: d.merchant_code,
    environment: d.environment as PartnerEnv,
    apiKey: d.api_key,
    secretKey: d.secret_key,
    endpointSandbox: d.endpoint_sandbox ?? null,
    endpointProduction: d.endpoint_production ?? null,
    callbackUrl: d.callback_url ?? null,
    webhookUrl: d.webhook_url ?? null,
    timeout: d.timeout,
    retryPolicy: d.retry_policy,
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleListPartners(req: NextRequest): Promise<Response> {
  const auth = authorize(req, false);
  if (auth instanceof Response) return auth;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const environment = sp.get("environment");
  const connectorType = sp.get("connector_type");
  return ok(
    await listPartners({
      status: STATUSES.includes(status as PartnerStatus) ? (status as PartnerStatus) : undefined,
      environment: ENVS.includes(environment as PartnerEnv)
        ? (environment as PartnerEnv)
        : undefined,
      connectorType:
        connectorType && PARTNER_TYPE_CODES.includes(connectorType) ? connectorType : undefined,
    }),
  );
}

export async function handleCreatePartner(req: NextRequest): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = partnerSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, parsed.error.flatten().fieldErrors);
  }
  return guard(async () => ok(await createPartner(toInput(parsed.data), actorOf(req)), 201));
}

export async function handleGetPartner(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req, false);
  if (auth instanceof Response) return auth;
  const id = parseId(rawId);
  const partner = id ? await getPartner(id) : null;
  return partner ? ok(partner) : err("NOT_FOUND", "Không tìm thấy đối tác", 404);
}

export async function handleUpdatePartner(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  const id = parseId(rawId);
  if (!id) return err("NOT_FOUND", "Không tìm thấy đối tác", 404);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = partnerSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 400, parsed.error.flatten().fieldErrors);
  }
  return guard(async () => ok(await updatePartner(id, toInput(parsed.data), actorOf(req))));
}

export async function handleTestPartner(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  const id = parseId(rawId);
  if (!id) return err("NOT_FOUND", "Không tìm thấy đối tác", 404);
  return guard(async () => {
    const { partner, testResult } = await testPartner(id, actorOf(req));
    return ok({ test_result: testResult, last_tested_at: partner.lastTestedAt, partner });
  });
}

export async function handleSetPartnerStatus(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  const id = parseId(rawId);
  if (!id) return err("NOT_FOUND", "Không tìm thấy đối tác", 404);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "status phải là Active hoặc Inactive", 400);
  }
  return guard(async () => ok(await setPartnerStatus(id, parsed.data.status, actorOf(req))));
}

export async function handleListPartnerLogs(req: NextRequest, rawId: string): Promise<Response> {
  const auth = authorize(req, false);
  if (auth instanceof Response) return auth;
  const id = parseId(rawId);
  if (!id) return err("NOT_FOUND", "Không tìm thấy đối tác", 404);
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));
  return ok(await listPartnerLogs(id, page, limit));
}
