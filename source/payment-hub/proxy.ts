import { NextResponse, type NextRequest } from "next/server";
import { extractBearerToken, verifyJwt } from "@/lib/auth";

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

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Merchant API (/api/v1/*) authenticates with API key + HMAC in the route handler.
  // Strip identity headers so a merchant request can never impersonate a JWT user.
  if (pathname.startsWith("/api/v1/") && request.headers.has("x-api-key")) {
    const headers = new Headers(request.headers);
    for (const h of ["x-user-id", "x-user-username", "x-user-roles", "x-merchant-id"]) {
      headers.delete(h);
    }
    return NextResponse.next({ request: { headers } });
  }

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

  // Forward user info to route handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-username", user.username);
  requestHeaders.set("x-user-roles", user.roles.join(","));
  if (user.merchantId) {
    requestHeaders.set("x-merchant-id", user.merchantId);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
