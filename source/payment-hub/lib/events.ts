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
