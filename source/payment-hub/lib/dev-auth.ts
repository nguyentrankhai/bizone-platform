// In production the admin token comes from the Keycloak session (OIDC login not wired yet —
// same approach as BizOne, see PROGRESS issue #7). For dev, pages read it from env so client
// components can call /api/internal/*. Only used by dynamic pages (after `await connection()`),
// so the token is read per request and never frozen into static HTML.
export function getDevAuthToken(): string {
  return process.env.DEV_AUTH_TOKEN ?? "";
}
