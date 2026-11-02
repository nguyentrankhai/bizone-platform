import { Redis } from "ioredis";

export function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return url;
}

export function describeError(err: Error): string {
  return (err as NodeJS.ErrnoException).code ?? err.message;
}

export function createRedis(): Redis {
  const client = new Redis(redisUrl(), { maxRetriesPerRequest: null });
  // Without a listener ioredis prints a full stack trace on every reconnect attempt.
  client.on("error", (err) => console.error(`[redis] ${describeError(err)}`));
  return client;
}

// Reused across hot reloads in dev so each edit doesn't open a new connection.
const globalForRedis = globalThis as unknown as { payhubRedis?: Redis };

export function getRedis(): Redis {
  globalForRedis.payhubRedis ??= createRedis();
  return globalForRedis.payhubRedis;
}
