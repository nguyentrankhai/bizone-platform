import { getRedis } from "./redis";

export const REALTIME_CHANNEL = "payhub:events";

export type RealtimeEvent = {
  type: string;
  data: unknown;
  at: string;
};

export async function publishEvent(type: string, data: unknown): Promise<void> {
  const event: RealtimeEvent = { type, data, at: new Date().toISOString() };
  await getRedis().publish(REALTIME_CHANNEL, JSON.stringify(event));
}

/**
 * Realtime fan-out filter: a client bound to one merchant (token claim `merchant_id`) only
 * receives events whose `data.merchantId` matches; admins without the claim get everything.
 */
export function canReceive(client: { merchantId?: number }, event: RealtimeEvent): boolean {
  if (client.merchantId === undefined) return true;
  const data = event.data as { merchantId?: unknown } | null;
  return Number(data?.merchantId) === client.merchantId;
}
