import { Queue } from "bullmq";
import { describeError } from "@/lib/redis";
import { queueConnection } from "@/services/queue/connection";

/**
 * BullMQ queue for dispute notifications (P5.6): `notify` e-mails the result of a dispute to its
 * creator and DISPUTE_NOTIFY_EMAILS — SMTP must never slow down the admin request.
 */

export const DISPUTE_QUEUE = "payhub-dispute";

export type DisputeJob = { kind: "notify"; disputeId: number };

const globalForQueue = globalThis as unknown as { payhubDisputeQueue?: Queue<DisputeJob> };

export function getDisputeQueue(): Queue<DisputeJob> {
  if (!globalForQueue.payhubDisputeQueue) {
    const queue = new Queue<DisputeJob>(DISPUTE_QUEUE, {
      connection: queueConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 7 * 86400, count: 1000 },
        removeOnFail: { age: 30 * 86400, count: 1000 },
      },
    });
    queue.on("error", (err) => console.error(`[dispute-queue] ${describeError(err)}`));
    globalForQueue.payhubDisputeQueue = queue;
  }
  return globalForQueue.payhubDisputeQueue;
}

/** One notification per final result (jobId dedupes a double click / retry of the request). */
export async function enqueueDisputeNotify(disputeId: number, status: string): Promise<void> {
  await getDisputeQueue().add(
    "notify",
    { kind: "notify", disputeId },
    { jobId: `notify-${disputeId}-${status}` },
  );
}
