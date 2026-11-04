import Redis from "ioredis";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? "redis://:123456@localhost:6379");
    _redis.on("error", () => {});
  }
  return _redis;
}

const TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface IdempotencyRecord<T = unknown> {
  status: "pending" | "done";
  response?: T;
  createdAt: number;
}

export async function getIdempotencyRecord<T>(key: string): Promise<IdempotencyRecord<T> | null> {
  const raw = await getRedis().get(`idem:${key}`);
  if (!raw) return null;
  return JSON.parse(raw) as IdempotencyRecord<T>;
}

export async function setIdempotencyPending(key: string): Promise<void> {
  const record: IdempotencyRecord = { status: "pending", createdAt: Date.now() };
  await getRedis().set(`idem:${key}`, JSON.stringify(record), "EX", TTL_SECONDS);
}

export async function setIdempotencyDone<T>(key: string, response: T): Promise<void> {
  const record: IdempotencyRecord<T> = {
    status: "done",
    response,
    createdAt: Date.now(),
  };
  await getRedis().set(`idem:${key}`, JSON.stringify(record), "EX", TTL_SECONDS);
}

/**
 * Atomically claim a key (SET NX). Returns null when this caller owns the key now,
 * or the existing record when another request already claimed or finished it.
 */
export async function claimIdempotencyKey<T>(key: string): Promise<IdempotencyRecord<T> | null> {
  const record: IdempotencyRecord = { status: "pending", createdAt: Date.now() };
  const ok = await getRedis().set(`idem:${key}`, JSON.stringify(record), "EX", TTL_SECONDS, "NX");
  if (ok === "OK") return null;
  return (await getIdempotencyRecord<T>(key)) ?? { status: "pending", createdAt: Date.now() };
}

/** Drop a pending claim after a failed attempt so the client can retry with the same key */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await getRedis().del(`idem:${key}`);
}
