import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 86400; // 24 hours
const KEY_PREFIX = "idempotency:payhub:";

export class IdempotencyConflict extends Error {
  constructor(public readonly cachedResponse: unknown) {
    super("Idempotency conflict: duplicate request");
    this.name = "IdempotencyConflict";
  }
}

/**
 * Check if a request with this key was already processed.
 * Returns the cached response if found.
 * Call markComplete() with the response once processing finishes.
 */
export async function checkIdempotency(merchantId: number, key: string): Promise<unknown | null> {
  const redis = getRedis();
  const redisKey = `${KEY_PREFIX}${merchantId}:${key}`;
  const cached = await redis.get(redisKey);
  if (cached) return JSON.parse(cached) as unknown;
  return null;
}

export async function saveIdempotency(
  merchantId: number,
  key: string,
  response: unknown,
): Promise<void> {
  const redis = getRedis();
  const redisKey = `${KEY_PREFIX}${merchantId}:${key}`;
  await redis.setex(redisKey, TTL_SECONDS, JSON.stringify(response));
}
