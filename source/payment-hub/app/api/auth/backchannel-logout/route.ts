import type { NextRequest } from "next/server";
import { revokeSessionFromKeycloak, verifyLogoutToken } from "@/lib/auth";

/**
 * POST /api/auth/backchannel-logout (P6.6, #146) — OpenID Connect Back-Channel Logout.
 * Keycloak calls it (form body `logout_token=…`) when a session ends outside the app: admin
 * "Sign out", user disabled / deleted, session expiry. The token is a JWT signed by the realm
 * (verified here — public in proxy.ts); its `sid` stops working at once, like an app logout.
 * Configured as `backchannel.logout.url` of the `payhub-admin-console` client.
 */
export async function POST(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const form = await req.formData().catch(() => null);
  const token = form?.get("logout_token");
  if (typeof token !== "string" || !token)
    return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  const result = await verifyLogoutToken(token);
  if (!result.ok) {
    console.warn("[auth] rejected back-channel logout:", result.reason);
    return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  try {
    await revokeSessionFromKeycloak(result.sessionId);
  } catch (err) {
    console.error("[auth] back-channel logout: revoke failed", err);
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: noStore });
  }
  return new Response(null, { status: 200, headers: noStore });
}
