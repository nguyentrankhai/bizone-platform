import { getRedis } from "./redis";
import { affectsTxnList, bumpTxnListVersion } from "./txn-list-cache";

export const REALTIME_CHANNEL = "payhub:events";

export type RealtimeEvent = {
  type: string;
  data: unknown;
  at: string;
};

export async function publishEvent(type: string, data: unknown): Promise<void> {
  const event: RealtimeEvent = { type, data, at: new Date().toISOString() };
  // P7.4: a transaction event invalidates the cached transaction lists (lib/txn-list-cache.ts)
  const bump = affectsTxnList(type)
    ? bumpTxnListVersion(Number((data as { merchantId?: unknown } | null)?.merchantId))
    : null;
  await Promise.all([getRedis().publish(REALTIME_CHANNEL, JSON.stringify(event)), bump]);
}

/**
 * Realtime fan-out filter: a client bound to one merchant (token claim `merchant_id`) only
 * receives events whose `data.merchantId` matches; admins without the claim get everything.
 */
export function canReceive(
  client: { merchantId?: number; admin?: boolean },
  event: RealtimeEvent,
): boolean {
  const data = event.data as { merchantId?: unknown; audience?: unknown } | null;
  // P7.3: operational notifications (audience "admin") only reach payhub-admin consoles
  if (data?.audience === "admin" && client.admin === false) return false;
  if (client.merchantId === undefined) return true;
  return Number(data?.merchantId) === client.merchantId;
}
