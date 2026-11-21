/**
 * P6.6 — Redis rate limits applied by the proxy (spec: 100 req/min general, 10 auth).
 * The merchant API (`/api/v1/*` with `X-Api-Key`) is limited per key in `apiAuth.ts`
 * (`api_keys.rate_limit`); a few heavy routes (exports, refunds, QR…) add their own tighter limit.
 */
export interface RateRule {
  name: string;
  limit: number;
  /** seconds */
  window: number;
  by: "ip" | "user";
}

export const RATE_LIMITS = { general: 100, auth: 10 } as const;

/** Rule for a public (unauthenticated) path — API or page; `null` = not limited here. */
export function publicRateRule(pathname: string): RateRule | null {
  // health probes: answered from a 5 s in-process cache (server/services/health.service.ts)
  if (pathname.startsWith("/api/health") || pathname === "/api/v1/health") return null;
  if (pathname.startsWith("/api/auth/backchannel-logout"))
    return { name: "backchannel", limit: 300, window: 60, by: "ip" };
  if (pathname.startsWith("/api/auth/"))
    return { name: "auth", limit: RATE_LIMITS.auth, window: 60, by: "ip" };
  // PSP notifications arrive in bursts from a few partner IPs
  if (pathname.startsWith("/api/ipn/")) return { name: "ipn", limit: 600, window: 60, by: "ip" };
  // payer pages: method choice, wallet returns, VietQR page refreshing every 15 s
  if (pathname.startsWith("/pay/")) return { name: "pay", limit: 60, window: 60, by: "ip" };
  if (pathname.startsWith("/qr/")) return { name: "qr-img", limit: 300, window: 60, by: "ip" };
  return null;
}

/** Rule for an authenticated admin API path (after the bearer token was verified). */
export function userRateRule(pathname: string): RateRule | null {
  if (!pathname.startsWith("/api/")) return null;
  return { name: "admin", limit: RATE_LIMITS.general, window: 60, by: "user" };
}
