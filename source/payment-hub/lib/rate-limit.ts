import { getRedis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

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

// 100 req/min per API key
export const rateLimitApiKey = (apiKey: string) => rateLimit(`rl:payhub:${apiKey}`, 100, 60);

// ─── Brute-force lockout (P6.6) ───────────────────────────────────────────────
// N failures inside a window lock the key (an IP, an account…) for a fixed time — PLAN: 5 wrong
// attempts → locked 15 minutes. Callers check `lockoutRemaining` before trying credentials and
// call `registerFailure` / `clearFailures` after.

/** Failure counter + lock of one subject share a hash tag (one MULTI on a Redis Cluster, P7.4). */
export function bfKey(subject: string, kind: "fail" | "lock"): string {
  return `bf:{${subject}}:${kind}`;
}

export const BRUTE_FORCE = { maxFailures: 5, windowSeconds: 900, lockSeconds: 900 } as const;

/** Seconds the key stays locked (0 = not locked). Redis errors → 0 (fail open, logged). */
export async function lockoutRemaining(key: string): Promise<number> {
  try {
    const ttl = await getRedis().ttl(bfKey(key, "lock"));
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    console.error("[lockout] redis error", err);
    return 0;
  }
}

/**
 * Lock + failure count of one subject in a single round trip (P7.4 — the merchant API checks it
 * on every call). Both keys share a hash tag, so the MGET is valid on a Redis Cluster. The lock
 * TTL is only read when the subject is locked. Redis errors → not locked (fail open, logged).
 */
export async function bruteForceState(key: string): Promise<{ locked: number; failures: number }> {
  try {
    const redis = getRedis();
    const [lock, fail] = await redis.mget(bfKey(key, "lock"), bfKey(key, "fail"));
    const locked = lock ? Math.max(await redis.ttl(bfKey(key, "lock")), 1) : 0;
    return { locked, failures: Number(fail ?? 0) || 0 };
  } catch (err) {
    console.error("[lockout] redis error", err);
    return { locked: 0, failures: 0 };
  }
}

/** Count one failure; returns the lock time in seconds when this failure locked the key, else 0. */
export async function registerFailure(
  key: string,
  opts: { maxFailures: number; windowSeconds: number; lockSeconds: number } = BRUTE_FORCE,
): Promise<number> {
  try {
    const redis = getRedis();
    const failKey = bfKey(key, "fail");
    const [[, count]] = (await redis
      .multi()
      .incr(failKey)
      .expire(failKey, opts.windowSeconds, "NX")
      .exec()) as [[unknown, number], unknown];
    if (count < opts.maxFailures) return 0;
    await redis.multi().set(bfKey(key, "lock"), "1", "EX", opts.lockSeconds).del(failKey).exec();
    return opts.lockSeconds;
  } catch (err) {
    console.error("[lockout] redis error", err);
    return 0;
  }
}

export async function clearFailures(key: string): Promise<void> {
  await getRedis()
    .del(bfKey(key, "fail"))
    .catch(() => undefined);
}
