import { z } from "zod";
import type { NextRequest } from "next/server";
import { ADMIN_WRITE_ROLES, requireAdmin, type AdminContext } from "@/server/middleware/adminAuth";
import { MAX_PACKAGE_BYTES } from "@/services/connectors/package";
import {
  ConnectorAdminError,
  checkConnectorHealth,
  getConnector,
  installPackage,
  listConnectors,
  removeConnector,
  setConnectorActive,
  type Actor,
} from "@/server/services/connector.service";

/**
 * Admin API of the Connector Manager (P7.1) — Keycloak JWT (proxy.ts) + role:
 *   GET    /api/internal/connectors               list (built-in + plugins, health, partners)
 *   POST   /api/internal/connectors               upload a signed plugin package (body = zip)
 *   GET    /api/internal/connectors/{code}        detail (versions, health history, changelog)
 *   DELETE /api/internal/connectors/{code}        remove a plugin (inactive, nothing pending)
 *   PUT    /api/internal/connectors/{code}/status { active: boolean } — hot-plug
 *   POST   /api/internal/connectors/{code}/health check now
 * Read: payhub-admin | payhub-viewer. Write: payhub-admin. Connectors are global, so tokens bound
 * to one merchant (merchant_id claim) are refused.
 */

const CODE = /^[a-z][a-z0-9_]{2,29}$/;

function ok(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

const STATUS: Record<ConnectorAdminError["code"], number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
};

function authorize(req: NextRequest, write: boolean): AdminContext | Response {
  const auth = write ? requireAdmin(req, ADMIN_WRITE_ROLES) : requireAdmin(req);
  if (auth instanceof Response) return auth;
  if (auth.merchantId !== undefined) {
    return err("FORBIDDEN", "Connector management is not available to merchant users", 403);
  }
  return auth;
}

function actorOf(req: NextRequest): Actor {
  return {
    username: req.headers.get("x-user-username") || req.headers.get("x-user-id") || "unknown",
  };
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConnectorAdminError) return err(e.code, e.message, STATUS[e.code], e.details);
    throw e;
  }
}

export async function handleListConnectors(req: NextRequest): Promise<Response> {
  const auth = authorize(req, false);
  if (auth instanceof Response) return auth;
  return ok(await listConnectors());
}

/** Read the raw zip body with a hard cap (the proxy already buffers at most 10 MB). */
async function readPackage(req: NextRequest): Promise<Uint8Array | Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_PACKAGE_BYTES) {
    return err("VALIDATION_ERROR", `Gói vượt quá ${MAX_PACKAGE_BYTES / 1024 / 1024} MB`, 413);
  }
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0) return err("VALIDATION_ERROR", "Thiếu tệp gói (body rỗng)", 400);
  if (buf.byteLength > MAX_PACKAGE_BYTES) {
    return err("VALIDATION_ERROR", `Gói vượt quá ${MAX_PACKAGE_BYTES / 1024 / 1024} MB`, 413);
  }
  return buf;
}

export async function handleUploadConnector(req: NextRequest): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  const buf = await readPackage(req);
  if (buf instanceof Response) return buf;
  return guard(async () => {
    const result = await installPackage(buf, actorOf(req));
    return ok(result, result.updated ? 200 : 201);
  });
}

export async function handleGetConnector(req: NextRequest, code: string): Promise<Response> {
  const auth = authorize(req, false);
  if (auth instanceof Response) return auth;
  if (!CODE.test(code)) return err("NOT_FOUND", "Không tìm thấy connector", 404);
  const detail = await getConnector(code);
  return detail ? ok(detail) : err("NOT_FOUND", "Không tìm thấy connector", 404);
}

export async function handleRemoveConnector(req: NextRequest, code: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  if (!CODE.test(code)) return err("NOT_FOUND", "Không tìm thấy connector", 404);
  return guard(async () => {
    await removeConnector(code, actorOf(req));
    return ok({ code, removed: true });
  });
}

const statusSchema = z.object({ active: z.boolean() });

export async function handleSetConnectorStatus(req: NextRequest, code: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  if (!CODE.test(code)) return err("NOT_FOUND", "Không tìm thấy connector", 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return err("VALIDATION_ERROR", "Body phải là { active: boolean }", 400);
  return guard(async () => ok(await setConnectorActive(code, parsed.data.active, actorOf(req))));
}

export async function handleConnectorHealth(req: NextRequest, code: string): Promise<Response> {
  const auth = authorize(req, true);
  if (auth instanceof Response) return auth;
  if (!CODE.test(code)) return err("NOT_FOUND", "Không tìm thấy connector", 404);
  return guard(async () => ok(await checkConnectorHealth(code, actorOf(req))));
}
