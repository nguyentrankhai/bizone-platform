import { handleMarketplacePush } from "@/server/omni/marketplaceWebhook";

/** POST /api/webhooks/tiktok — TikTok Shop webhooks (order status / return / deauthorization), P6.3 */
export async function POST(req: Request) {
  return handleMarketplacePush("tiktok", req);
}
