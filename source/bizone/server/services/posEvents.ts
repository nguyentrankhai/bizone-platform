import { getRedis } from "@/lib/redis";
import { posChannel, type PosServerEvent } from "@/lib/pos/protocol";
import { currentTenantId } from "@/lib/tenant";

/**
 * Publish a POS event to every WebSocket instance serving this cash session
 * of the current tenant (server/ws/pos.ts subscribes to `bizone:pos:*`). Best effort: a sale must not
 * fail because the customer display is offline.
 */
export async function publishPosEvent(sessionId: number, event: PosServerEvent): Promise<void> {
  try {
    await getRedis().publish(
      posChannel(currentTenantId(), sessionId),
      JSON.stringify({ ...event, at: new Date().toISOString() }),
    );
  } catch (err) {
    console.error("[pos] publish failed:", err instanceof Error ? err.message : err);
  }
}
