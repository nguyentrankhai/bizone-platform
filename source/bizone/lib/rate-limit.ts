import { getRedis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix ms
}

/**
 * Sliding window rate limiter using Redis.
 * key    — unique identifier (e.g. "rl:tenant:userId:route")
 * limit  — max requests per window
 * window — window size in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  window: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = window * 1000;
  const clearBefore = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, clearBefore);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs,
  };
}

// Convenience wrappers matching BizOne rate-limit spec
export const rateLimitGeneral = (tenantId: string, userId: string) =>
  rateLimit(`rl:g:${tenantId}:${userId}`, 100, 60);

export const rateLimitPos = (tenantId: string, userId: string) =>
  rateLimit(`rl:pos:${tenantId}:${userId}`, 300, 60);

export const rateLimitAuth = (ip: string) => rateLimit(`rl:auth:${ip}`, 10, 60);

/** Hits recorded with `recordHit` in the last `window` seconds (no hit added) */
export async function countInWindow(key: string, window: number): Promise<number> {
  const redis = getRedis();
  await redis.zremrangebyscore(key, 0, Date.now() - window * 1000);
  return redis.zcard(key);
}

/** Record one hit for `countInWindow` (e.g. a failed attempt) */
export async function recordHit(key: string, window: number): Promise<void> {
  const now = Date.now();
  await getRedis()
    .pipeline()
    .zadd(key, now, `${now}-${Math.random()}`)
    .pexpire(key, window * 1000)
    .exec();
}
