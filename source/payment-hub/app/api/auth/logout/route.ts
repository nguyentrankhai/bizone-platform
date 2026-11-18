import type { NextRequest } from "next/server";
import { authenticateToken, extractBearerToken, revokeSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { okResponse } from "@/lib/response";

/**
 * POST /api/auth/logout (P6.7) — called by the admin console just before Keycloak's
 * end-session: the API stops accepting this token's session at once (instead of when the
 * token expires). Verifies the token itself, so it is public in proxy.ts.
 */
export async function POST(req: NextRequest) {
  const result = await authenticateToken(extractBearerToken(req.headers.get("authorization")));
  if (!result.ok) return errorResponse("UNAUTHORIZED", "Phiên đăng nhập không hợp lệ");
  const { sessionId, expiresAt } = result.user;
  if (sessionId) await revokeSession(sessionId, expiresAt);
  return okResponse({ revoked: !!sessionId });
}
