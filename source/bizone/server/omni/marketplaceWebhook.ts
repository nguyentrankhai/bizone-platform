import { runWithTenant } from "@/lib/tenant";
import type { MarketplaceCode } from "@/lib/omni/marketplace";
import { connectorFor } from "@/server/services/omni/marketplace/registry";
import { findShopTenant } from "@/server/services/omni/marketplaceChannel.service";
import { logSync } from "@/server/services/omni/websiteChannel.service";
import { getPrisma } from "@/lib/prisma";
import { enqueueOmniSync } from "@/server/queue/omniSync";

/**
 * Push notifications of Shopee / Lazada (P6.2). Verified with the platform signature, mapped to
 * the tenant owning the shop, then handed to the worker — the platforms want a 2xx within a few
 * seconds, so nothing is fetched here. Unknown shops / events are acknowledged and ignored.
 */
export async function handleMarketplacePush(
  code: MarketplaceCode,
  req: Request,
): Promise<Response> {
  const connector = connectorFor(code);
  if (!connector.configured())
    return Response.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Not configured" } },
      { status: 503 },
    );
  const raw = await req.text();
  if (raw.length > 256 * 1024)
    return Response.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Body too large" } },
      { status: 413 },
    );
  if (!connector.verifyPush(req.headers, raw))
    return Response.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Invalid signature" } },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } },
      { status: 400 },
    );
  }
  const event = connector.parsePush(body);
  if (!event || event.kind === "other")
    return Response.json({ success: true, data: { ignored: true } });
  const owner = await findShopTenant(code, event.shopId);
  if (!owner) return Response.json({ success: true, data: { ignored: "unknown shop" } });

  if (event.kind === "deauthorized") {
    await runWithTenant(owner.tenantId, async () => {
      await getPrisma().channelConnection.update({
        where: { id: owner.channelId },
        data: { lastError: "AUTH: Chủ shop đã huỷ uỷ quyền cho BizOne trên sàn" },
      });
      await logSync({
        channelId: owner.channelId,
        syncType: "auth",
        direction: "pull",
        status: "failed",
        message: "Chủ shop đã huỷ uỷ quyền — kết nối lại để tiếp tục đồng bộ",
      });
    });
    return Response.json({ success: true, data: { deauthorized: true } });
  }
  if (event.orderIds.length)
    await enqueueOmniSync(
      { kind: "order-fetch", channelId: owner.channelId, orderIds: event.orderIds },
      owner.tenantId,
    );
  return Response.json({ success: true, data: { queued: event.orderIds.length } });
}
