import { Cluster, Redis, type ClusterNode } from "ioredis";

/**
 * Redis connection (P7.4): a single server (`REDIS_URL`) or a Redis Cluster
 * (`REDIS_CLUSTER_NODES="host:port,host:port,…"`, credentials from `REDIS_URL` /
 * `REDIS_PASSWORD`). Every Payment Hub process — app instances, workers, realtime relays —
 * shares the same Redis: rate limits, idempotency keys, caches, circuit breakers, BullMQ queues.
 *
 * Cluster rule: a command (MULTI, MGET, DEL a b, Lua) may only touch keys of one hash slot.
 * Keys used together carry the same hash tag (`{…}`): see `slotTag`, the circuit-breaker and
 * brute-force keys, and the BullMQ prefix (`queuePrefix`).
 */
export type RedisClient = Redis | Cluster;

export function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return url;
}

/** Cluster seed nodes, or `null` for a single server. */
export function clusterNodes(
  env: Record<string, string | undefined> = process.env,
): ClusterNode[] | null {
  const raw = env.REDIS_CLUSTER_NODES?.trim();
  if (!raw) return null;
  const nodes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(?:redis:\/\/)?\[?([^\]\s]+?)\]?:(\d+)$/.exec(s);
      if (!m) throw new Error(`REDIS_CLUSTER_NODES: invalid node "${s}" (expected host:port)`);
      return { host: m[1], port: Number(m[2]) };
    });
  return nodes.length ? nodes : null;
}

export function isClusterMode(env: Record<string, string | undefined> = process.env): boolean {
  return clusterNodes(env) !== null;
}

/** Username / password for cluster nodes: REDIS_URL credentials, else REDIS_PASSWORD. */
function clusterAuth(env: Record<string, string | undefined>): {
  username?: string;
  password?: string;
} {
  let username: string | undefined;
  let password = env.REDIS_PASSWORD || undefined;
  if (env.REDIS_URL) {
    try {
      const u = new URL(env.REDIS_URL);
      if (u.username) username = decodeURIComponent(u.username);
      if (u.password) password = decodeURIComponent(u.password);
    } catch {
      // REDIS_URL is optional in cluster mode
    }
  }
  return { username, password };
}

export function describeError(err: Error): string {
  return (err as NodeJS.ErrnoException).code ?? err.message;
}

/**
 * New connection (subscribers and BullMQ need their own). `maxRetriesPerRequest: null` — BullMQ
 * workers require it so blocking commands are never aborted.
 */
export function createRedis(): RedisClient {
  const nodes = clusterNodes();
  const client: RedisClient = nodes
    ? new Cluster(nodes, {
        redisOptions: { ...clusterAuth(process.env), maxRetriesPerRequest: null },
        // Required by BullMQ on a cluster: commands wait for the slot map instead of failing
        enableOfflineQueue: true,
        scaleReads: "master",
      })
    : new Redis(redisUrl(), { maxRetriesPerRequest: null });
  // Without a listener ioredis prints a full stack trace on every reconnect attempt.
  client.on("error", (err: Error) => console.error(`[redis] ${describeError(err)}`));
  return client;
}

// Reused across hot reloads in dev so each edit doesn't open a new connection.
const globalForRedis = globalThis as unknown as { payhubRedis?: RedisClient };

export function getRedis(): RedisClient {
  globalForRedis.payhubRedis ??= createRedis();
  return globalForRedis.payhubRedis;
}

/**
 * Hash tag: keys built with the same tag land in the same cluster slot, so they can be used in
 * one MULTI / MGET / DEL. On a single server it is just part of the key name.
 */
export function slotTag(name: string): string {
  return `{${name}}`;
}

/**
 * BullMQ key prefix. Default `bull` on a single server (existing queues keep their jobs); on a
 * cluster BullMQ requires a hash tag so every key of a queue is in one slot → `{payhub}`.
 * Switching an existing deployment to the cluster prefix starts with empty queues — drain first.
 */
export function queuePrefix(env: Record<string, string | undefined> = process.env): string {
  if (env.QUEUE_PREFIX) return env.QUEUE_PREFIX;
  return isClusterMode(env) ? "{payhub}" : "bull";
}

/**
 * Every key matching `pattern` — on a cluster SCAN only sees one node, so each master is scanned.
 * For cache housekeeping (small key sets), not for hot paths.
 */
export async function scanKeys(
  pattern: string,
  redis: RedisClient = getRedis(),
): Promise<string[]> {
  const nodes: Redis[] = redis instanceof Cluster ? redis.nodes("master") : [redis];
  const out = new Set<string>();
  for (const node of nodes) {
    let cursor = "0";
    do {
      const [next, keys] = await node.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      for (const k of keys) out.add(k);
    } while (cursor !== "0");
  }
  return [...out];
}

/** Delete keys that may live in different slots (one UNLINK per key on a cluster). */
export async function unlinkKeys(keys: string[], redis: RedisClient = getRedis()): Promise<number> {
  if (keys.length === 0) return 0;
  if (!(redis instanceof Cluster)) return redis.unlink(...keys);
  const counts = await Promise.all(keys.map((k) => redis.unlink(k)));
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * Run `fn` only if no other process holds `name` (SET NX PX). Periodic jobs use it so several
 * worker instances never run the same sweep at once. Returns `undefined` when the lock is taken.
 */
export async function withLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
  redis: RedisClient = getRedis(),
): Promise<T | undefined> {
  const key = `payhub:lock:${name}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if ((await redis.set(key, token, "PX", ttlMs, "NX")) !== "OK") return undefined;
  try {
    return await fn();
  } finally {
    await redis
      .eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        1,
        key,
        token,
      )
      .catch(() => undefined);
  }
}
