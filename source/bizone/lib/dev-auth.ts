// In production, tenantId and authToken come from the Keycloak session (not wired yet — see P2.2).
// For dev, pages read them from env so client components can call tRPC.
export function getDevAuth() {
  return {
    tenantId: process.env.DEV_TENANT_ID ?? "tenant_demo",
    authToken: process.env.DEV_AUTH_TOKEN ?? "",
  };
}

/**
 * Why API calls from pages will fail before browser login exists (issue #7):
 * "missing" — DEV_AUTH_TOKEN not set; "expired" — token past its `exp` (15-minute Keycloak tokens).
 * Decodes the payload only (no signature check) — the API still verifies every request.
 */
export function devAuthProblem(now = Date.now()): "missing" | "expired" | null {
  const token = process.env.DEV_AUTH_TOKEN;
  if (!token) return "missing";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as {
      exp?: number;
    };
    return payload.exp && payload.exp * 1000 < now ? "expired" : null;
  } catch {
    return "expired";
  }
}
