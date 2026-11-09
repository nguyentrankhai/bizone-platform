import { DEV_BYPASS_TOKEN, devBypassUser, isDevAuthBypass } from "@/lib/auth";

// In production, tenantId and authToken come from the Keycloak session (browser login: P6.7).
// For dev, pages read them from env so client components can call tRPC.
// With AUTH_DEV_BYPASS=true (P4.0) and DEV_AUTH_TOKEN unset, pages hand out the placeholder token
// "dev-bypass" — the API maps it (or no token at all) to the dev user. Pure env read: pages call
// this while prerendering, so no clock / request data here.
export function getDevAuth() {
  const token = process.env.DEV_AUTH_TOKEN ?? "";
  return {
    tenantId: process.env.DEV_TENANT_ID ?? "tenant_demo",
    authToken: token || (isDevAuthBypass() ? DEV_BYPASS_TOKEN : ""),
  };
}

/**
 * Why API calls from pages will fail before browser login exists (issue #7):
 * "missing" — DEV_AUTH_TOKEN not set (and no dev bypass); "expired" — token past its `exp`
 * (15-minute Keycloak tokens; with the bypass on, removing DEV_AUTH_TOKEN switches to the dev user).
 */
export function devAuthProblem(now = Date.now()): "missing" | "expired" | null {
  const token = process.env.DEV_AUTH_TOKEN ?? "";
  if (!token) return isDevAuthBypass() ? null : "missing";
  const payload = decodePayload(token);
  if (!payload) return "expired";
  return payload.exp && payload.exp * 1000 < now ? "expired" : null;
}

/**
 * Dev-mode notice data: who pages act as while AUTH_DEV_BYPASS=true — the DEV_AUTH_TOKEN user
 * when that variable is set, otherwise the configured dev user. null when bypass is off.
 */
export function devBypassNotice(): { username: string; roles: string[] } | null {
  if (!isDevAuthBypass()) return null;
  const token = process.env.DEV_AUTH_TOKEN ?? "";
  if (token) {
    const claims = decodePayload(token);
    return {
      username: String(claims?.preferred_username ?? "DEV_AUTH_TOKEN"),
      roles: claims?.realm_access?.roles?.filter((r) => r.startsWith("bizone-")) ?? [],
    };
  }
  const user = devBypassUser();
  return { username: user.username, roles: user.roles };
}

interface DevClaims {
  exp?: number;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

/** Decodes the payload only (no signature check) — the API still verifies every request. */
function decodePayload(token: string): DevClaims | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as DevClaims;
  } catch {
    return null;
  }
}
