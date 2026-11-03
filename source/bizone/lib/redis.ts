import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { bizoneRedis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.bizoneRedis) {
    globalForRedis.bizoneRedis = new Redis(process.env.REDIS_URL ?? "redis://:123456@localhost:6379");
    globalForRedis.bizoneRedis.on("error", () => {});
  }
  return globalForRedis.bizoneRedis;
}
