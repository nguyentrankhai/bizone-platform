import { NextResponse, type NextRequest } from "next/server";
import { authenticateToken, extractBearerToken } from "@/lib/auth";
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
  "/api/auth", // Keycloak callback routes
  "/api/webhooks/", // inbound partner webhooks — authenticated by HMAC in the route (P3.6)
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes via middleware; page routes handle auth in RSC
  if (isPublicPath(pathname) || !pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: strippedHeaders(request) } });
  }

  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  // Dev bypass (P4.0): no token → dev user when AUTH_DEV_BYPASS=true
  const result = await authenticateToken(token);

  if (!result.ok) {
    return jsonError(
      401,
      "UNAUTHORIZED",
      result.reason === "missing_token" ? "Missing Bearer token" : result.reason,
    );
  }

  const { user } = result;

  // Validate X-Tenant-ID header matches tenant_id claim
  const headerTenantId = request.headers.get("x-tenant-id");
  if (!headerTenantId) {
    return jsonError(403, "FORBIDDEN", "Missing X-Tenant-ID header");
  }

  if (headerTenantId !== user.tenantId) {
    return jsonError(403, "FORBIDDEN", "X-Tenant-ID mismatch");
  }

  if (!isKnownTenant(headerTenantId)) {
    return jsonError(403, "FORBIDDEN", "Tenant is not provisioned");
  }

  // Forward user info to route handlers via request headers
  const requestHeaders = strippedHeaders(request);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * Must be kept lightweight — runs before every matched request (Node.js runtime).
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
