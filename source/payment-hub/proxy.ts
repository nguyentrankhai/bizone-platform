import { NextResponse, type NextRequest } from "next/server";
import { authenticateToken, extractBearerToken } from "@/lib/auth";
import { IDENTITY_HEADERS } from "@/server/middleware/adminAuth";

const PUBLIC_PATHS = [
  "/api/health",
  "/api/v1/webhooks", // inbound partner webhooks (verified by HMAC, not JWT)
  "/api/ipn/", // PSP IPN callbacks (verified by the connector's signature, not JWT)
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/** Copy of the request headers without any client-supplied identity headers. */
function strippedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) headers.delete(h);
  return headers;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Identity headers are only ever set below, from a verified JWT — strip them on every path
  // so no request (public, page or API) can impersonate a user.
  if (isPublicPath(pathname) || !pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: strippedHeaders(request) } });
  }

  // Merchant API (/api/v1/*) authenticates with API key + HMAC in the route handler.
  if (pathname.startsWith("/api/v1/") && request.headers.has("x-api-key")) {
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

  // Forward user info to route handlers
  const requestHeaders = strippedHeaders(request);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));
  if (user.email) requestHeaders.set("x-user-email", user.email);
  if (user.merchantId) {
    requestHeaders.set("x-merchant-id", user.merchantId);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
