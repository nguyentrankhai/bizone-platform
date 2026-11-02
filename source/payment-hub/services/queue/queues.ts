import { Queue } from "bullmq";
import { describeError } from "@/lib/redis";
import type { WebhookJob } from "@/services/webhook/deliver";
import { queueConnection } from "./connection";

export const QUEUE_NAMES = {
  webhookDelivery: "webhook-delivery",
} as const;

const globalForQueues = globalThis as unknown as { payhubWebhookQueue?: Queue<WebhookJob> };

export function getWebhookQueue(): Queue<WebhookJob> {
  if (!globalForQueues.payhubWebhookQueue) {
    const queue = new Queue<WebhookJob>(QUEUE_NAMES.webhookDelivery, {
      connection: queueConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queue.on("error", (err) => console.error(`[queue] ${describeError(err)}`));
    globalForQueues.payhubWebhookQueue = queue;
  }
  return globalForQueues.payhubWebhookQueue;
}

export async function enqueueWebhook(job: WebhookJob): Promise<string | undefined> {
  const added = await getWebhookQueue().add(job.event, job);
  return added.id;
}
