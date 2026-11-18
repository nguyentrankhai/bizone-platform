import { NextResponse, type NextRequest } from "next/server";

/**
 * P6.3 — order source: a buyer arriving from a link shared on a social channel (Facebook /
 * Instagram catalog item, Zalo OA post…) carries `?utm_source=`. The last one seen is kept for
 * 7 days in `bz_src` and sent with the order, so BizOne can tell where website orders come from.
 * Runs only on requests that carry the parameter.
 */
export function proxy(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("utm_source")?.trim().toLowerCase() ?? "";
  const res = NextResponse.next();
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
      source: "/((?!_next/|favicon.ico).*)",
      has: [{ type: "query", key: "utm_source" }],
    },
  ],
};
