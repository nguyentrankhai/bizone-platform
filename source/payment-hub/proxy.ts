import { NextResponse, type NextRequest } from "next/server";
import { authenticateToken, extractBearerToken, isTokenAttackFailure } from "@/lib/auth";
import { clientIp, rateLimitClient } from "@/lib/client-ip";
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
import { IDENTITY_HEADERS } from "@/server/middleware/adminAuth";

const PUBLIC_PATHS = [
  "/api/health",
  "/api/v1/webhooks", // inbound partner webhooks (verified by HMAC, not JWT)
  "/api/ipn/", // PSP IPN callbacks (verified by the connector's signature, not JWT)
  "/api/auth/logout", // verifies the bearer token itself (P6.7)
  "/api/auth/backchannel-logout", // Keycloak logout token, verified by signature (P6.6)
  "/_next",
  "/favicon.ico",
];

/** Called by partner servers, never by a browser page — exempt from the cross-site write check */
const SERVER_TO_SERVER = ["/api/ipn/", "/api/v1/webhooks", "/api/auth/backchannel-logout"];

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

/** Copy of the request headers without any client-supplied identity headers. */
function strippedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) headers.delete(h);
  return headers;
}

// ─── P6.6 policy ──────────────────────────────────────────────────────────────

const CORS_ALLOWED = originList(process.env.CORS_ALLOWED_ORIGINS);
const FORCE_HTTPS = process.env.FORCE_HTTPS === "true";
const DEV = process.env.NODE_ENV === "development";

/** Invalid (forged / foreign) bearer tokens from one IP before it is locked out (expired don't count) */
const TOKEN_FAILURES = { maxFailures: 20, windowSeconds: 900, lockSeconds: 900 };

function cspFor(request: NextRequest, https: boolean): string {
  const host = (requestHost(request.headers) ?? request.nextUrl.host).replace(/:\d+$/, "");
  const wsDefault = `${https ? "wss" : "ws"}://${host}:${process.env.WS_PORT ?? "4001"}`;
  return buildCsp({
    dev: DEV,
    https,
    connectSrc: [
      originOf(process.env.NEXT_PUBLIC_KEYCLOAK_URL) ?? "",
      originOf(process.env.NEXT_PUBLIC_WS_URL) ?? wsDefault,
      ...originList(process.env.CSP_CONNECT_SRC),
    ],
  });
}

function finalize(
  res: NextResponse,
  request: NextRequest,
  https: boolean,
  cors: Record<string, string> | null,
) {
  const headers = securityHeaders({
    csp: cspFor(request, https),
    https,
    // VietQR images are meant to be shown by merchant pages on other sites
    corp: request.nextUrl.pathname.startsWith("/qr/") ? "cross-origin" : "same-site",
  });
  for (const [k, v] of Object.entries({ ...headers, ...(cors ?? {}) })) res.headers.set(k, v);
  return res;
}

async function overLimit(rule: RateRule, subject: string): Promise<NextResponse | null> {
  try {
    const r = await rateLimit(`rl:payhub:${rule.name}:${subject}`, rule.limit, rule.window);
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

  const pass = (cors: Record<string, string> | null) =>
    finalize(
      NextResponse.next({ request: { headers: strippedHeaders(request) } }),
      request,
      https,
      cors,
    );

  // Identity headers are only ever set below, from a verified JWT — strip them on every path
  // so no request (public, page or API) can impersonate a user.
  if (!pathname.startsWith("/api/")) {
    const rule = publicRateRule(pathname);
    const limited = rule && (await overLimit(rule, rateLimitClient(request.headers)));
    if (limited) return finalize(limited, request, https, null);
    return pass(null);
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

  if (isPublicPath(pathname)) {
    const rule = publicRateRule(pathname);
    const limited = rule && (await overLimit(rule, rateLimitClient(request.headers)));
    if (limited) return finalize(limited, request, https, cors);
    return pass(cors);
  }

  // Merchant API (/api/v1/*) authenticates with API key + HMAC in the route handler
  // (rate limit per key + brute-force lockout there).
  if (pathname.startsWith("/api/v1/") && request.headers.has("x-api-key")) {
    return pass(cors);
  }

  // ── Brute-force guard: an IP sending forged tokens is locked out (only with a known IP) ──
  const ip = clientIp(request.headers);
  const lockKey = ip ? `payhub:token:${ip}` : null;
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

  const rule = userRateRule(pathname);
  const limited = rule && (await overLimit(rule, user.id));
  if (limited) return finalize(limited, request, https, cors);

  // Forward user info to route handlers
  const requestHeaders = strippedHeaders(request);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));
  if (user.email) requestHeaders.set("x-user-email", user.email);
  if (user.merchantId) {
    requestHeaders.set("x-merchant-id", user.merchantId);
  }

  return finalize(
    NextResponse.next({ request: { headers: requestHeaders } }),
    request,
    https,
    cors,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
