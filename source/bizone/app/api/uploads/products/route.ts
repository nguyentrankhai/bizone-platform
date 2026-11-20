import type { NextRequest } from "next/server";
import { authenticateToken, extractBearerToken } from "@/lib/auth";
import { clientIp, UNTRUSTED_CLIENT } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";
import {
  checkOrigin,
  isHttpsRequest,
  originList,
  requestHost,
  securityHeaders,
} from "@/lib/security/http";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import { readBodyLimited, UPLOAD_LIMITS, UploadError, validateUpload } from "@/lib/upload";
import { recordAudit } from "@/server/services/auditLog.service";
import { importProductsFromExcel } from "@/server/services/productImport.service";
import { getStaffAccess } from "@/server/services/rbac.service";
import { resolveDbUserId } from "@/server/services/user.service";

/** Imports per user per minute (each parses up to 50 MB of Excel) */
const UPLOADS_PER_MINUTE = 10;

/**
 * POST /api/uploads/products (P6.6) — product Excel import (template from `product.template`).
 * Body: the raw .xlsx bytes; headers: Authorization, X-Tenant-ID, optional X-File-Name.
 *
 * Excluded from proxy.ts on purpose: the proxy buffers whole request bodies (10 MB cap), while
 * this route streams the body and stops at 50 MB. So it does the proxy's checks itself:
 * same-site origin, token, tenant, rate limit, permission `product:write`, then lib/upload.ts
 * (size, real file type, zip-bomb guard) before exceljs reads anything.
 */
export async function POST(req: NextRequest) {
  const base = {
    ...securityHeaders({
      csp: "default-src 'none'; frame-ancestors 'none'",
      https: isHttpsRequest(req.headers, req.nextUrl.protocol),
    }),
    "Cache-Control": "no-store",
  };
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: base });
  const fail = (status: number, code: string, message: string) =>
    reply(status, { success: false, error: { code, message } });

  const verdict = checkOrigin(
    req.headers.get("origin"),
    requestHost(req.headers),
    originList(process.env.CORS_ALLOWED_ORIGINS),
  );
  if (verdict === "denied") return fail(403, "FORBIDDEN", "Origin not allowed");

  const auth = await authenticateToken(extractBearerToken(req.headers.get("authorization")));
  if (!auth.ok) return fail(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ");
  const user = auth.user;
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId || tenantId !== user.tenantId || !isKnownTenant(tenantId))
    return fail(403, "FORBIDDEN", "X-Tenant-ID không hợp lệ");

  return runWithTenant(tenantId, async () => {
    const limit = await rateLimit(`rl:upload:${tenantId}:${user.id}`, UPLOADS_PER_MINUTE, 60).catch(
      () => ({ allowed: true }),
    );
    if (!limit.allowed) return fail(429, "RATE_LIMITED", "Quá nhiều lần tải tệp, thử lại sau");

    const access = await getStaffAccess(user);
    if (!access.active || !hasPermission(user, "product:write", access.capabilities))
      return fail(403, "FORBIDDEN", "Required permission: product:write");

    let bytes: Uint8Array;
    try {
      bytes = await readBodyLimited(req, UPLOAD_LIMITS.excel);
      validateUpload(bytes, "excel");
    } catch (e) {
      if (e instanceof UploadError) return fail(e.status, e.code, e.message);
      throw e;
    }

    let outcome;
    try {
      outcome = await importProductsFromExcel(bytes, await resolveDbUserId(user));
    } catch (e) {
      console.error("[upload] product import failed", e);
      return fail(400, "VALIDATION_ERROR", "Không đọc được tệp Excel");
    }

    let fileName = req.headers.get("x-file-name") ?? "";
    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      // keep the raw header
    }
    fileName = fileName.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 200);
    const ip = clientIp(req.headers);
    await recordAudit({
      userId: await resolveDbUserId(user),
      module: "product",
      action: "import",
      entityType: "product",
      newValue: {
        fileName,
        size: bytes.length,
        imported: outcome.imported,
        errors: outcome.errors.length,
      },
      ipAddress: ip === UNTRUSTED_CLIENT ? undefined : ip.slice(0, 45),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return reply(200, { success: true, data: outcome });
  });
}
