import { handleMarketplacePush } from "@/server/omni/marketplaceWebhook";

/** POST /api/webhooks/lazada — Lazada push (trade order status), P6.2 */
export function POST(req: Request) {
  return handleMarketplacePush("lazada", req);
}
