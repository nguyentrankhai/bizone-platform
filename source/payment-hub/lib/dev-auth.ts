import { DEV_BYPASS_TOKEN, devBypassUser, isDevAuthBypass } from "@/lib/auth";

// In production the admin token comes from the Keycloak session (OIDC login: P6.7 — same
// approach as BizOne, see PROGRESS issue #7). For dev, pages read it from env so client
// components can call /api/internal/*. Only used by dynamic pages (after `await connection()`),
// so the token is read per request and never frozen into static HTML.
// With AUTH_DEV_BYPASS=true (P4.0) and DEV_AUTH_TOKEN unset, pages hand out the placeholder
// token "dev-bypass" — proxy.ts / the realtime server map it to the dev user.
export function getDevAuthToken(): string {
  const token = process.env.DEV_AUTH_TOKEN ?? "";
  return token || (isDevAuthBypass() ? DEV_BYPASS_TOKEN : "");
}

/**
 * Whether the dev token carries payhub-admin — only a UI hint (hides edit buttons); the API
 * enforces roles itself. The token is decoded without verification on purpose.
 */
export function devTokenCanWrite(token: string): boolean {
  if (token === DEV_BYPASS_TOKEN) {
    const user = devBypassUser();
    return user.roles.includes("payhub-admin") && !user.merchantId;
  }
  const claims = decodePayload(token);
  return !!claims?.realm_access?.roles?.includes("payhub-admin") && !claims.merchant_id;
}

/**
 * merchant_id claim of the dev token (UI scoping hint only — the API enforces the scope).
 */
export function devTokenMerchantId(token: string): number | undefined {
  const raw =
    token === DEV_BYPASS_TOKEN ? devBypassUser().merchantId : decodePayload(token)?.merchant_id;
  const n = Number(raw);
  return raw !== undefined && raw !== null && raw !== "" && Number.isSafeInteger(n) && n > 0
    ? n
    : undefined;
}

/**
 * Dev-mode notice: who admin pages act as while AUTH_DEV_BYPASS=true — the DEV_AUTH_TOKEN user
 * when that variable is set, otherwise the configured dev user. null when bypass is off.
 */
export function devBypassNotice(): {
  username: string;
  roles: string[];
  merchantId?: string;
} | null {
  if (!isDevAuthBypass()) return null;
  const token = process.env.DEV_AUTH_TOKEN ?? "";
  if (token) {
    const claims = decodePayload(token);
    return {
      username: String(claims?.preferred_username ?? "DEV_AUTH_TOKEN"),
      roles: claims?.realm_access?.roles?.filter((r) => r.startsWith("payhub-")) ?? [],
      merchantId: claims?.merchant_id ? String(claims.merchant_id) : undefined,
    };
  }
  const user = devBypassUser();
  return { username: user.username, roles: user.roles, merchantId: user.merchantId };
}

interface DevClaims {
  exp?: number;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  merchant_id?: unknown;
}

function decodePayload(token: string): DevClaims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DevClaims;
  } catch {
    return null;
  }
}
