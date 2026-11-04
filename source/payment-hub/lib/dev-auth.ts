// In production the admin token comes from the Keycloak session (OIDC login not wired yet —
// same approach as BizOne, see PROGRESS issue #7). For dev, pages read it from env so client
// components can call /api/internal/*. Only used by dynamic pages (after `await connection()`),
// so the token is read per request and never frozen into static HTML.
export function getDevAuthToken(): string {
  return process.env.DEV_AUTH_TOKEN ?? "";
}

/**
 * Whether the dev token carries payhub-admin — only a UI hint (hides edit buttons); the API
 * enforces roles itself. The token is decoded without verification on purpose.
 */
export function devTokenCanWrite(token: string): boolean {
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      realm_access?: { roles?: string[] };
      merchant_id?: unknown;
    };
    return !!claims.realm_access?.roles?.includes("payhub-admin") && !claims.merchant_id;
  } catch {
    return false;
  }
}
