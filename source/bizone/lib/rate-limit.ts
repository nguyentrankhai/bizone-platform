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

// ─── Brute-force lockout (P6.6) ───────────────────────────────────────────────
// N failures inside a window lock the key (an IP, an account…) for a fixed time — PLAN: 5 wrong
// attempts → locked 15 minutes. Callers check `lockoutRemaining` before trying credentials and
// call `registerFailure` / `clearFailures` after.

export const BRUTE_FORCE = { maxFailures: 5, windowSeconds: 900, lockSeconds: 900 } as const;

/** Seconds the key stays locked (0 = not locked). Redis errors → 0 (fail open, logged). */
export async function lockoutRemaining(key: string): Promise<number> {
  try {
    const ttl = await getRedis().ttl(`bf:lock:${key}`);
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    console.error("[lockout] redis error", err);
    return 0;
  }
}

/** Count one failure; returns the lock time in seconds when this failure locked the key, else 0. */
export async function registerFailure(
  key: string,
  opts: { maxFailures: number; windowSeconds: number; lockSeconds: number } = BRUTE_FORCE,
): Promise<number> {
  try {
    const redis = getRedis();
    const failKey = `bf:fail:${key}`;
    const [[, count]] = (await redis
      .multi()
      .incr(failKey)
      .expire(failKey, opts.windowSeconds, "NX")
      .exec()) as [[unknown, number], unknown];
    if (count < opts.maxFailures) return 0;
    await redis.multi().set(`bf:lock:${key}`, "1", "EX", opts.lockSeconds).del(failKey).exec();
    return opts.lockSeconds;
  } catch (err) {
    console.error("[lockout] redis error", err);
    return 0;
  }
}

export async function clearFailures(key: string): Promise<void> {
  await getRedis()
    .del(`bf:fail:${key}`)
    .catch(() => undefined);
}
