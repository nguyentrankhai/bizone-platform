import type { NextRequest } from "next/server";

/**
 * Authorization for the admin/internal API (`/api/internal/*`).
 *
 * `proxy.ts` verifies the Keycloak JWT and forwards the identity as `x-user-*` headers
 * (after stripping any client-supplied copies), so handlers only read them here.
 */

export const ADMIN_READ_ROLES = ["payhub-admin", "payhub-viewer"] as const;
export const ADMIN_WRITE_ROLES = ["payhub-admin"] as const;

/** Identity headers set by proxy.ts — never trusted when they come from the client. */
export const IDENTITY_HEADERS = ["x-user-id", "x-user-username", "x-user-roles", "x-merchant-id"];

export interface AdminContext {
  userId: string;
  roles: string[];
  /** Set when the token is bound to one merchant: every query must be scoped to it. */
  merchantId?: number;
}

function forbidden(code: string, message: string, status: number): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export function requireAdmin(
  req: NextRequest,
  allowedRoles: readonly string[] = ADMIN_READ_ROLES,
): AdminContext | Response {
  const userId = req.headers.get("x-user-id");
  if (!userId) return forbidden("UNAUTHORIZED", "Missing or invalid token", 401);

  const roles = (req.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
  if (!roles.some((r) => allowedRoles.includes(r))) {
    return forbidden("FORBIDDEN", `Required role: ${allowedRoles.join(" | ")}`, 403);
  }

  const rawMerchant = req.headers.get("x-merchant-id");
  let merchantId: number | undefined;
  if (rawMerchant) {
    merchantId = Number(rawMerchant);
    if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
      return forbidden("FORBIDDEN", "Invalid merchant_id claim", 403);
    }
  }

  return { userId, roles, merchantId };
}
