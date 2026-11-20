import { NextResponse, type NextRequest } from "next/server";
import {
  buildCsp,
  httpsRedirectUrl,
  isHttpsRequest,
  originList,
  originOf,
  securityHeaders,
} from "@/lib/security/http";

const FORCE_HTTPS = process.env.FORCE_HTTPS === "true";
const DEV = process.env.NODE_ENV === "development";

/**
 * P6.6 — every page gets a strict Content-Security-Policy with a fresh nonce: pages render per
 * request (cookies, live stock), so Next stamps the nonce on its own scripts and nothing else
 * may run (no `'unsafe-inline'` scripts). Plus HTTPS enforcement and Helmet-style headers.
 *
 * P6.3 — order source: a buyer arriving from a link shared on a social channel (Facebook /
 * Instagram catalog item, Zalo OA post…) carries `?utm_source=`. The last one seen is kept for
 * 7 days in `bz_src` and sent with the order, so BizOne can tell where website orders come from.
 */
export function proxy(request: NextRequest) {
  const https = isHttpsRequest(request.headers, request.nextUrl.protocol);
  const redirectTo = httpsRedirectUrl(request.nextUrl, request.headers, {
    force: FORCE_HTTPS,
    https,
  });
  if (redirectTo) return NextResponse.redirect(redirectTo, 308);

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    dev: DEV,
    https,
    nonce,
    // product images are links to any https host (BizOne catalog); plain http only off-https
    imgSrc: https ? ["https:"] : ["https:", "http:"],
    // checkout without JavaScript: the server action redirects the form to Payment Hub
    formAction: [
      originOf(process.env.PAYMENT_HUB_URL) ?? "",
      ...originList(process.env.CSP_FORM_ACTION),
    ],
  });

  // Next reads the nonce from the request's CSP header while rendering
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [k, v] of Object.entries(securityHeaders({ csp, https }))) res.headers.set(k, v);

  const raw = request.nextUrl.searchParams.get("utm_source")?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9._-]{1,40}$/.test(raw))
    res.cookies.set("bz_src", raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "true",
      path: "/",
      maxAge: 7 * 86_400,
    });
  return res;
}

export const config = {
  matcher: [
    {
      // pages only: static files don't need a CSP; prefetches reuse the page's policy
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
