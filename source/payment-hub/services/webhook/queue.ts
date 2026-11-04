import { Queue } from "bullmq";
import { describeError } from "@/lib/redis";
import { queueConnection } from "@/services/queue/connection";

/**
 * BullMQ queue for outgoing webhooks. A job carries no secret (issue #3): the worker reads the
 * webhook config (and decrypts its secret) at send time, so rotating a secret or disabling an
 * endpoint applies to pending retries too.
 */

export const WEBHOOK_QUEUE = "webhook-delivery";

export interface WebhookJob {
  deliveryId: string;
  webhookConfigId: number;
  /** Target URL (config URL, or the transaction's webhook_url override) */
  url: string;
  event: string;
  transactionId: number | null;
  /** Serialized JSON body, signed as-is */
  body: string;
  /** Seconds to wait before retry n (index n-1); last value repeats */
  retryIntervals: number[];
}

const globalForQueue = globalThis as unknown as { payhubWebhookQueue?: Queue<WebhookJob> };

export function getWebhookQueue(): Queue<WebhookJob> {
  if (!globalForQueue.payhubWebhookQueue) {
    const queue = new Queue<WebhookJob>(WEBHOOK_QUEUE, {
      connection: queueConnection(),
      defaultJobOptions: {
        backoff: { type: "webhook" },
        removeOnComplete: { age: 7 * 86400, count: 5000 },
        removeOnFail: { age: 30 * 86400, count: 10000 },
      },
    });
    queue.on("error", (err) => console.error(`[webhook-queue] ${describeError(err)}`));
    globalForQueue.payhubWebhookQueue = queue;
  }
  return globalForQueue.payhubWebhookQueue;
}

/** Delay before the next attempt (ms) — BullMQ custom backoff strategy "webhook". */
export function webhookBackoff(attemptsMade: number, job?: { data: WebhookJob }): number {
  const intervals = job?.data.retryIntervals?.length ? job.data.retryIntervals : [60];
  const seconds = intervals[Math.min(attemptsMade - 1, intervals.length - 1)] ?? 60;
  return seconds * 1000;
}

/**
 * Enqueue one delivery. attempts = 1 + retryCount. jobId makes enqueueing idempotent per
 * (delivery, endpoint): the outbox can safely re-dispatch after a crash.
 */
export async function enqueueWebhook(job: WebhookJob, retryCount: number): Promise<void> {
  await getWebhookQueue().add(job.event, job, {
    jobId: `${job.deliveryId}_${job.webhookConfigId}`, // BullMQ custom ids may not contain ":"
    attempts: retryCount + 1,
  });
}
