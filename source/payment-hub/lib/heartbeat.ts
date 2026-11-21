import { utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { getRedis, type RedisClient } from "@/lib/redis";

/**
 * Process heartbeats (P7.5). Each worker / realtime instance adds itself every
 * `HEARTBEAT_INTERVAL_S` (10 s) to one sorted set per role (score = time) — one key, so it works
 * the same on a Redis Cluster. The health check counts members seen in the last
 * `HEARTBEAT_TTL_S` (30 s): no live worker = webhooks, reconciliation, expiry… are stalled even
 * though the API still answers (status "degraded").
 *
 * A heartbeat file (`HEARTBEAT_FILE`, touched only after Redis accepted the beat) lets Docker's
 * healthcheck mark a worker that lost Redis as unhealthy.
 */

export type HeartbeatRole = "worker" | "realtime";

export const HEARTBEAT_INTERVAL_MS = 10_000;

export function heartbeatTtlMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.HEARTBEAT_TTL_S);
  return (Number.isFinite(n) && n > 0 ? n : 30) * 1000;
}

export const heartbeatKey = (role: HeartbeatRole) => `payhub:{hb}:${role}`;

export function instanceId(): string {
  return `${hostname()}:${process.pid}`;
}

export async function beat(
  role: HeartbeatRole,
  id = instanceId(),
  redis: RedisClient = getRedis(),
  now = Date.now(),
): Promise<void> {
  const key = heartbeatKey(role);
  await redis
    .multi()
    .zadd(key, now, id)
    .zremrangebyscore(key, 0, now - 10 * heartbeatTtlMs())
    .pexpire(key, 10 * heartbeatTtlMs())
    .exec();
}

/** Instances of `role` seen within the heartbeat TTL. */
export async function liveInstances(
  role: HeartbeatRole,
  redis: RedisClient = getRedis(),
  now = Date.now(),
): Promise<string[]> {
  return redis.zrangebyscore(heartbeatKey(role), now - heartbeatTtlMs(), "+inf");
}

/** Start beating; returns a stop function (called on shutdown — removes the instance). */
export function startHeartbeat(role: HeartbeatRole, file = process.env.HEARTBEAT_FILE): () => void {
  const id = instanceId();
  let fileReady = false;
  const tick = async () => {
    try {
      await beat(role, id);
      if (file) {
        if (!fileReady) {
          await writeFile(file, id);
          fileReady = true;
        } else {
          const t = new Date();
          await utimes(file, t, t);
        }
      }
    } catch (err) {
      console.error(`[heartbeat] ${role}: ${(err as Error).message}`);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    void getRedis()
      .zrem(heartbeatKey(role), id)
      .catch(() => {});
  };
}
