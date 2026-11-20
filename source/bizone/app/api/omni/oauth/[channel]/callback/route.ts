import { connection } from "next/server";
import { isMarketplace } from "@/lib/omni/marketplace";
import {
  OAUTH_BINDING_COOKIE,
  finishConnect,
} from "@/server/services/omni/marketplaceChannel.service";
import { MarketplaceError } from "@/server/services/omni/marketplace/types";

/**
 * GET /api/omni/oauth/{shopee|lazada}/callback — the marketplace sends the shop owner's browser
 * back here after authorizing BizOne. Public (no JWT): trusted through the one-time `state`
 * created by the admin's "Kết nối" click plus the binding cookie that click left in the admin's
 * browser (QA-5 #160). Redirects back to the channel screen and clears the cookie.
 */
export async function GET(req: Request, { params }: { params: Promise<{ channel: string }> }) {
  await connection();
  const { channel } = await params;
  const app = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
  if (!isMarketplace(channel)) return Response.redirect(`${app}/omni`, 302);
  const query = new URL(req.url).searchParams;
  const name = OAUTH_BINDING_COOKIE(channel);
  const back = (location: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Set-Cookie": `${name}=; Path=/api/omni/oauth; Max-Age=0; SameSite=Lax`,
      },
    });
  try {
    await finishConnect(channel, query, readCookie(req.headers.get("cookie"), name));
    return back(`${app}/omni/${channel}?connected=1`);
  } catch (e) {
    const message =
      e instanceof MarketplaceError ? e.message : "Không hoàn tất được kết nối, vui lòng thử lại";
    if (!(e instanceof MarketplaceError)) console.error(`[omni-oauth] ${channel}:`, e);
    return back(`${app}/omni/${channel}?error=${encodeURIComponent(message)}`);
  }
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}
