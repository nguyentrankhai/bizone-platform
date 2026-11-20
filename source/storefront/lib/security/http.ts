/**
 * P6.6 — HTTP security policy: Content-Security-Policy, Helmet-style response headers, HTTPS
 * detection / enforcement and the CORS / Origin check of the API.
 *
 * Pure functions (no Next / Redis imports): the proxy passes request data in and applies what
 * comes back. The same file lives in BizOne, Payment Hub and the storefront (which uses the
 * strict nonce mode) — keep the three copies identical (`tests/security-http.test.ts`).
 */

type HeaderSource = { get(name: string): string | null };

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ─── HTTPS ───────────────────────────────────────────────────────────────────

/**
 * Whether the browser reached us over https. Behind a TLS-terminating reverse proxy the app
 * sees plain http, so `X-Forwarded-Proto` decides — trusted only with `TRUST_PROXY=true`
 * (same rule as `lib/client-ip.ts`).
 */
export function isHttpsRequest(
  headers: HeaderSource,
  urlProtocol: string,
  trustProxy = process.env.TRUST_PROXY === "true",
): boolean {
  if (trustProxy) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (proto) return proto === "https";
  }
  return urlProtocol === "https:";
}

/** Host the browser used (`X-Forwarded-Host` only behind a trusted proxy). */
export function requestHost(
  headers: HeaderSource,
  trustProxy = process.env.TRUST_PROXY === "true",
): string | null {
  const forwarded = trustProxy ? headers.get("x-forwarded-host")?.split(",")[0]?.trim() : null;
  return (forwarded || headers.get("host") || "").toLowerCase() || null;
}

/**
 * `FORCE_HTTPS=true` (production): plain-http requests get a 308 to the https URL. Health checks
 * stay reachable over http (Docker / load balancer probes hit the container directly).
 */
export function httpsRedirectUrl(
  url: URL,
  headers: HeaderSource,
  opts: { force: boolean; https: boolean },
): string | null {
  if (!opts.force || opts.https) return null;
  if (url.pathname === "/api/health") return null;
  const host = requestHost(headers);
  if (!host) return null;
  return `https://${host}${url.pathname}${url.search}`;
}

// ─── Content-Security-Policy ─────────────────────────────────────────────────

export interface CspOptions {
  /** `next dev` — React needs `eval` for its debug stacks */
  dev: boolean;
  /** served over https → also `upgrade-insecure-requests` */
  https: boolean;
  /** origins the page may fetch() / open WebSockets to besides itself (Keycloak, realtime WS) */
  connectSrc?: string[];
  /** image origins besides itself, `data:` and `blob:` */
  imgSrc?: string[];
  /** where forms may submit / redirect to besides itself */
  formAction?: string[];
  /**
   * Strict mode (storefront): scripts only with this per-request nonce. Without it scripts are
   * `'self' 'unsafe-inline'` — BizOne / Payment Hub keep Cache Components static shells (PPR),
   * whose inline RSC scripts can't carry a per-request nonce (decision P6.6).
   */
  nonce?: string;
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function buildCsp(o: CspOptions): string {
  const script = o.nonce
    ? ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'"]
    : ["'self'", "'unsafe-inline'"];
  if (o.dev) script.push("'unsafe-eval'");
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // React `style={…}` attributes in server HTML need 'unsafe-inline' (a nonce would disable it)
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(o.imgSrc ?? [])]],
    ["font-src", ["'self'", "data:"]],
    // the main exfiltration channel for a stolen token — only our own APIs, Keycloak, realtime WS
    ["connect-src", ["'self'", ...(o.connectSrc ?? [])]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...(o.formAction ?? [])]],
  ];
  if (o.https) directives.push(["upgrade-insecure-requests", []]);
  return directives.map(([name, values]) => [name, ...uniq(values)].join(" ")).join("; ");
}

/** `http://host:port` from a URL-ish env value; `null` when empty / not a URL. */
export function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Space / comma separated list of origins from env (`CSP_CONNECT_SRC`, `CORS_ALLOWED_ORIGINS`). */
export function originList(value: string | undefined | null): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((s) => originOf(s.trim()))
    .filter((s): s is string => !!s);
}

// ─── Helmet-style headers ────────────────────────────────────────────────────

export interface SecurityHeaderOptions {
  csp: string;
  /** https request → Strict-Transport-Security */
  https: boolean;
  /** Permissions-Policy features this app uses (e.g. `usb=(self)` for receipt printers) */
  permissions?: string[];
  /** `Cross-Origin-Resource-Policy`; `null` = don't send (resources other sites embed) */
  corp?: "same-origin" | "same-site" | "cross-origin" | null;
}

export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

const DENIED_FEATURES = [
  "camera",
  "microphone",
  "geolocation",
  "payment",
  "usb",
  "serial",
  "bluetooth",
  "hid",
  "browsing-topics",
];

export function permissionsPolicy(allowed: string[] = []): string {
  const allowedNames = new Set(allowed.map((a) => a.split("=")[0]));
  return [...allowed, ...DENIED_FEATURES.filter((f) => !allowedNames.has(f)).map((f) => `${f}=()`)]
    .sort()
    .join(", ");
}

export function securityHeaders(o: SecurityHeaderOptions): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Security-Policy": o.csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": permissionsPolicy(o.permissions),
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Origin-Agent-Cluster": "?1",
  };
  const corp = o.corp === undefined ? "same-site" : o.corp;
  if (corp) h["Cross-Origin-Resource-Policy"] = corp;
  if (o.https) h["Strict-Transport-Security"] = HSTS_VALUE;
  return h;
}

// ─── CORS / Origin check ─────────────────────────────────────────────────────

/**
 * - `none`: no `Origin` header (server-to-server, curl, same-origin GET navigation)
 * - `same`: the page of this app itself
 * - `allowed`: an origin in `CORS_ALLOWED_ORIGINS`
 * - `denied`: any other site (incl. the opaque `null` origin)
 */
export type OriginVerdict = "none" | "same" | "allowed" | "denied";

export function checkOrigin(
  origin: string | null,
  host: string | null,
  allowed: readonly string[],
): OriginVerdict {
  if (!origin) return "none";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return "denied";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "denied";
  if (host && parsed.host.toLowerCase() === host.toLowerCase()) return "same";
  const normalized = `${parsed.protocol}//${parsed.host}`.toLowerCase();
  return allowed.some((a) => a.toLowerCase() === normalized) ? "allowed" : "denied";
}

export const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "X-Idempotency-Key",
  "X-Tenant-ID",
  "X-Branch-ID",
  "X-Api-Key",
  "X-Signature",
  "X-Timestamp",
  "X-Request-ID",
  "trpc-accept",
  "x-trpc-source",
].join(", ");

/** Headers for a response to an allowed cross-origin request (no cookies: bearer tokens only). */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers":
      "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, Idempotent-Replayed",
    Vary: "Origin",
  };
}

export function preflightHeaders(origin: string): Record<string, string> {
  return {
    ...corsHeaders(origin),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Max-Age": "600",
  };
}

/**
 * Cross-site requests that change state are refused outright (CSRF): a browser on another site
 * can't make the API act, even through endpoints that don't need a bearer token. Paths called
 * server-to-server by partners (webhooks, IPN) never carry a browser `Origin`, so they're exempt.
 */
export function blocksCrossSiteWrite(
  method: string,
  verdict: OriginVerdict,
  pathname: string,
  serverToServerPrefixes: readonly string[],
): boolean {
  if (verdict !== "denied" || SAFE_METHODS.has(method.toUpperCase())) return false;
  return !serverToServerPrefixes.some((p) => pathname.startsWith(p));
}
