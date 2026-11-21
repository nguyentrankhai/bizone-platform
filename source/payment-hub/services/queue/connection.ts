import type { ConnectionOptions } from "bullmq";
import { createRedis, isClusterMode, queuePrefix, redisUrl } from "@/lib/redis";

/**
 * BullMQ connection + key prefix (P7.4). Single server → connection options (BullMQ opens its
 * own connections); cluster → an ioredis `Cluster` instance (BullMQ duplicates it for blocking
 * commands) and the hash-tagged prefix `{payhub}` so each queue stays in one slot.
 * Workers require maxRetriesPerRequest: null so blocking commands are never aborted.
 */
export function queueConnection(): ConnectionOptions {
  if (isClusterMode()) return createRedis() as ConnectionOptions;
  return { url: redisUrl(), maxRetriesPerRequest: null };
}

/** `{ connection, prefix }` for every `new Queue` / `new Worker` of Payment Hub. */
export function queueOptions(): { connection: ConnectionOptions; prefix: string } {
  return { connection: queueConnection(), prefix: queuePrefix() };
}
