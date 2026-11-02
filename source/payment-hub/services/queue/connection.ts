import type { ConnectionOptions } from "bullmq";
import { redisUrl } from "@/lib/redis";

// BullMQ workers require maxRetriesPerRequest: null so blocking commands are never aborted.
export function queueConnection(): ConnectionOptions {
  return { url: redisUrl(), maxRetriesPerRequest: null };
}
