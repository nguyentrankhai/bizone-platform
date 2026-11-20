import { NextResponse, type NextRequest } from "next/server";
import { authenticateToken, extractBearerToken, isTokenAttackFailure } from "@/lib/auth";
import { clientIp, UNTRUSTED_CLIENT } from "@/lib/client-ip";
import { lockoutRemaining, rateLimit, registerFailure } from "@/lib/rate-limit";
import {
  blocksCrossSiteWrite,
  buildCsp,
  checkOrigin,
  corsHeaders,
  httpsRedirectUrl,
  isHttpsRequest,
  originList,
  originOf,
  preflightHeaders,
  requestHost,
  securityHeaders,
} from "@/lib/security/http";
import { publicRateRule, userRateRule, type RateRule } from "@/lib/security/rate-rules";
import { isKnownTenant } from "@/lib/tenant";

/** Identity headers are only ever set below from a verified JWT — never trusted from clients. */
const IDENTITY_HEADERS = ["x-user-id", "x-user-username", "x-user-roles"];

function strippedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) headers.delete(h);
  return headers;
}

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth/logout", // verifies the bearer token itself (P6.7) — no tenant header
  "/api/auth/backchannel-logout", // Keycloak logout token, verified by signature (P6.6)
  "/api/webhooks/", // inbound partner webhooks — authenticated by HMAC in the route (P3.6)
  "/api/pos/pair", // customer display exchanges a one-time PIN for a display token (P4.5)
  "/api/store/", // storefront API — authenticated by the store key in the route (P6.1)
  "/api/omni/oauth/", // marketplace OAuth return — trusted through the one-time state (P6.2)
  "/_next",
  "/favicon.ico",
];

/** Called by partner servers, never by a browser page — exempt from the cross-site write check */
const SERVER_TO_SERVER = ["/api/webhooks/", "/api/auth/backchannel-logout", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status, headers });
}

// ─── P6.6 policy ──────────────────────────────────────────────────────────────

const CORS_ALLOWED = originList(process.env.CORS_ALLOWED_ORIGINS);
const FORCE_HTTPS = process.env.FORCE_HTTPS === "true";
const DEV = process.env.NODE_ENV === "development";

/** Invalid (forged / foreign) bearer tokens from one IP before it is locked out (expired don't count) */
const TOKEN_FAILURES = { maxFailures: 20, windowSeconds: 900, lockSeconds: 900 };

function cspFor(request: NextRequest, https: boolean): string {
  const host = (requestHost(request.headers) ?? request.nextUrl.host).replace(/:\d+$/, "");
  const wsDefault = `${https ? "wss" : "ws"}://${host}:${process.env.POS_WS_PORT ?? "3002"}`;
  return buildCsp({
    dev: DEV,
    https,
    connectSrc: [
      originOf(process.env.NEXT_PUBLIC_KEYCLOAK_URL) ?? "",
      originOf(process.env.NEXT_PUBLIC_POS_WS_URL) ?? wsDefault,
      ...originList(process.env.CSP_CONNECT_SRC),
    ],
    // product images are links to any https host (P2.2); plain http only off-https (dev)
    imgSrc: https ? ["https:"] : ["https:", "http:"],
  });
}

/** Policy headers on every response the proxy lets through or produces. */
function finalize(
  res: NextResponse,
  request: NextRequest,
  https: boolean,
  cors: Record<string, string> | null,
) {
  const headers = securityHeaders({
    csp: cspFor(request, https),
    https,
    // receipt printers over WebUSB / Web Bluetooth (P4.5)
    permissions: ["usb=(self)", "bluetooth=(self)"],
  });
  for (const [k, v] of Object.entries({ ...headers, ...(cors ?? {}) })) res.headers.set(k, v);
  return res;
}

async function overLimit(rule: RateRule, subject: string): Promise<NextResponse | null> {
  try {
    const r = await rateLimit(`rl:${rule.name}:${subject}`, rule.limit, rule.window);
    if (r.allowed) return null;
    return jsonError(429, "RATE_LIMITED", "Too many requests", {
      "Retry-After": String(rule.window),
      "X-RateLimit-Limit": String(rule.limit),
      "X-RateLimit-Remaining": "0",
    });
  } catch (err) {
    console.error("[proxy] rate limit unavailable", err);
    return null; // Redis down: serve rather than fail every request
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const https = isHttpsRequest(request.headers, request.nextUrl.protocol);

  const redirectTo = httpsRedirectUrl(request.nextUrl, request.headers, {
    force: FORCE_HTTPS,
    https,
  });
  if (redirectTo) return NextResponse.redirect(redirectTo, 308);

  if (!pathname.startsWith("/api/")) {
    return finalize(
      NextResponse.next({ request: { headers: strippedHeaders(request) } }),
      request,
      https,
      null,
    );
  }

  // ── CORS whitelist + cross-site write (CSRF) check ──
  const origin = request.headers.get("origin");
  const verdict = checkOrigin(origin, requestHost(request.headers), CORS_ALLOWED);
  const cors = verdict === "allowed" && origin ? corsHeaders(origin) : null;
  if (request.method === "OPTIONS") {
    if (verdict === "allowed" && origin)
      return finalize(
        new NextResponse(null, { status: 204, headers: preflightHeaders(origin) }),
        request,
        https,
        null,
      );
    return finalize(jsonError(403, "FORBIDDEN", "Origin not allowed"), request, https, null);
  }
  if (blocksCrossSiteWrite(request.method, verdict, pathname, SERVER_TO_SERVER)) {
    return finalize(jsonError(403, "FORBIDDEN", "Origin not allowed"), request, https, null);
  }

  const ip = clientIp(request.headers);

  if (isPublicPath(pathname)) {
    const rule = publicRateRule(pathname);
    const limited = rule && (await overLimit(rule, ip));
    if (limited) return finalize(limited, request, https, cors);
    return finalize(
      NextResponse.next({ request: { headers: strippedHeaders(request) } }),
      request,
      https,
      cors,
    );
  }

  // ── Brute-force guard: an IP sending forged tokens is locked out (only with a known IP —
  // without TRUST_PROXY every client shares one bucket and a lockout would hit everyone) ──
  const lockKey = ip !== UNTRUSTED_CLIENT ? `token:${ip}` : null;
  if (lockKey) {
    const locked = await lockoutRemaining(lockKey);
    if (locked > 0)
      return finalize(
        jsonError(429, "RATE_LIMITED", "Too many invalid credentials — try again later", {
          "Retry-After": String(locked),
        }),
        request,
        https,
        cors,
      );
  }

  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  const result = await authenticateToken(token);

  if (!result.ok) {
    if (lockKey && isTokenAttackFailure(result)) await registerFailure(lockKey, TOKEN_FAILURES);
    return finalize(
      jsonError(
        401,
        "UNAUTHORIZED",
        result.reason === "missing_token" ? "Missing Bearer token" : result.reason,
      ),
      request,
      https,
      cors,
    );
  }

  const { user } = result;

  // Validate X-Tenant-ID header matches tenant_id claim
  const headerTenantId = request.headers.get("x-tenant-id");
  if (!headerTenantId) {
    return finalize(
      jsonError(403, "FORBIDDEN", "Missing X-Tenant-ID header"),
      request,
      https,
      cors,
    );
  }

  if (headerTenantId !== user.tenantId) {
    return finalize(jsonError(403, "FORBIDDEN", "X-Tenant-ID mismatch"), request, https, cors);
  }

  if (!isKnownTenant(headerTenantId)) {
    return finalize(jsonError(403, "FORBIDDEN", "Tenant is not provisioned"), request, https, cors);
  }

  const rule = userRateRule(pathname);
  const limited = rule && (await overLimit(rule, `${user.tenantId}:${user.id}`));
  if (limited) return finalize(limited, request, https, cors);

  // Forward user info to route handlers via request headers
  const requestHeaders = strippedHeaders(request);
  // P4.6: branch picked in the top bar — tRPC calls send X-Branch-ID, plain route handlers / SSE
  // get it from the cookie. The tRPC branch scope validates it against the user's branches.
  // tRPC always sends the header itself (from localStorage) — never fill it from the cookie there.
  const branchCookie = request.cookies.get("bizone_branch")?.value;
  if (!pathname.startsWith("/api/trpc") && !requestHeaders.get("x-branch-id") && branchCookie) {
    requestHeaders.set("x-branch-id", branchCookie);
  }
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));

  return finalize(
    NextResponse.next({ request: { headers: requestHeaders } }),
    request,
    https,
    cors,
  );
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * Must be kept lightweight — runs before every matched request (Node.js runtime).
     * /api/uploads/* streams large bodies with its own checks (the proxy would buffer them).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/uploads/).*)",
  ],
};
