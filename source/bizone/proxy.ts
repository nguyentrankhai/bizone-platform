import { NextResponse, type NextRequest } from "next/server";
import { extractBearerToken, verifyJwt } from "@/lib/auth";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth",        // Keycloak callback routes
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

  if (isPublicPath(pathname)) return NextResponse.next();

  // Only protect /api/* routes via middleware; page routes handle auth in RSC
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return jsonError(401, "UNAUTHORIZED", "Missing Bearer token");
  }

  const result = await verifyJwt(token);

  if (!result.ok) {
    return jsonError(401, "UNAUTHORIZED", result.reason);
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

  // Forward user info to route handlers via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * Must be kept lightweight — this runs on Edge Runtime.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
