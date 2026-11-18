import { connection } from "next/server";
import { isMarketplace } from "@/lib/omni/marketplace";
import { finishConnect } from "@/server/services/omni/marketplaceChannel.service";
import { MarketplaceError } from "@/server/services/omni/marketplace/types";

/**
 * GET /api/omni/oauth/{shopee|lazada}/callback — the marketplace sends the shop owner's browser
 * back here after authorizing BizOne. Public (no JWT): trusted through the one-time `state`
 * created by the admin's "Kết nối" click. Redirects back to the channel screen.
 */
export async function GET(req: Request, { params }: { params: Promise<{ channel: string }> }) {
  await connection();
  const { channel } = await params;
  const app = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
  if (!isMarketplace(channel)) return Response.redirect(`${app}/omni`, 302);
  const query = new URL(req.url).searchParams;
  try {
    await finishConnect(channel, query);
    return Response.redirect(`${app}/omni/${channel}?connected=1`, 302);
  } catch (e) {
    const message =
      e instanceof MarketplaceError ? e.message : "Không hoàn tất được kết nối, vui lòng thử lại";
    if (!(e instanceof MarketplaceError)) console.error(`[omni-oauth] ${channel}:`, e);
    return Response.redirect(`${app}/omni/${channel}?error=${encodeURIComponent(message)}`, 302);
  }
}
