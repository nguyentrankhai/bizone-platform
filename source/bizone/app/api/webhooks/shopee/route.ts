import { handleMarketplacePush } from "@/server/omni/marketplaceWebhook";

/** POST /api/webhooks/shopee — Shopee push (order status / tracking / deauthorization), P6.2 */
export function POST(req: Request) {
  return handleMarketplacePush("shopee", req);
}
