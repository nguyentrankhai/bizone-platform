/**
 * P6.6 — Redis rate limits applied by the proxy (spec: 100 req/min general, 300 POS, 10 auth).
 *
 * tRPC (`/api/trpc`) is limited per user inside its middleware (general / POS), the Store API and
 * the customer-display pairing route limit themselves (store key / customer IP / PIN) — the proxy
 * covers everything else under `/api/`.
 */
export interface RateRule {
  name: string;
  limit: number;
  /** seconds */
  window: number;
  /** `ip` for public endpoints, `user` for authenticated ones */
  by: "ip" | "user";
}

export const RATE_LIMITS = { general: 100, pos: 300, auth: 10 } as const;

const SELF_LIMITED = ["/api/health", "/api/trpc", "/api/store/", "/api/pos/pair"];

/** Rule for a public (unauthenticated) API path; `null` = not limited here. */
export function publicRateRule(pathname: string): RateRule | null {
  if (SELF_LIMITED.some((p) => pathname.startsWith(p))) return null;
  // Keycloak back-channel logout comes from one server IP — verified by signature, not limited as auth
  if (pathname.startsWith("/api/auth/backchannel-logout"))
    return { name: "backchannel", limit: 300, window: 60, by: "ip" };
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/omni/oauth/"))
    return { name: "auth", limit: RATE_LIMITS.auth, window: 60, by: "ip" };
  // marketplace / Payment Hub pushes arrive in bursts from a few partner IPs
  if (pathname.startsWith("/api/webhooks/"))
    return { name: "webhook", limit: 600, window: 60, by: "ip" };
  return null;
}

/** Rule for an authenticated API path (after the bearer token was verified). */
export function userRateRule(pathname: string): RateRule | null {
  if (SELF_LIMITED.some((p) => pathname.startsWith(p))) return null;
  return { name: "api", limit: RATE_LIMITS.general, window: 60, by: "user" };
}
