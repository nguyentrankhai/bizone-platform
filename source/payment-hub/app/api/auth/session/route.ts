import type { NextRequest } from "next/server";
import { authenticateToken, extractBearerToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getRedis } from "@/lib/redis";
import { okResponse } from "@/lib/response";
import { recordAudit, requestContext } from "@/services/audit/logger";

/**
 * POST /api/auth/session (P7.2) — the admin console calls it right after the Keycloak sign-in
 * (/auth/callback). Sign-in happens at Keycloak, so this is where Payment Hub learns of it: the
 * bearer token is verified here (public in proxy.ts, like /api/auth/logout) and an `auth.login`
 * audit entry is written once per Keycloak session (`sid`) — a forged call cannot create one.
 */
const SEEN_TTL_S = 24 * 3600;

export async function POST(req: NextRequest) {
  const result = await authenticateToken(extractBearerToken(req.headers.get("authorization")));
  if (!result.ok) return errorResponse("UNAUTHORIZED", "Phiên đăng nhập không hợp lệ");
  const { user } = result;
  let first = true;
  if (user.sessionId) {
    try {
      first =
        (await getRedis().set(
          `payhub:auth:seen:${user.sessionId}`,
          "1",
          "EX",
          SEEN_TTL_S,
          "NX",
        )) === "OK";
    } catch {
      first = true; // Redis down: an extra entry is better than a missing one
    }
  }
  if (first) {
    await recordAudit({
      ...requestContext(req),
      actor: { id: user.id, username: user.username ?? user.id },
      action: "auth.login",
      entityType: "session",
      entityId: user.sessionId ?? null,
      newData: { roles: user.roles, merchant_id: user.merchantId ?? null, email: user.email },
      description: "Đăng nhập trang quản trị (Keycloak)",
    });
  }
  return okResponse({ recorded: first });
}
