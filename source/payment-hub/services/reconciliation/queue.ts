import { Queue } from "bullmq";
import { describeError } from "@/lib/redis";
import { queueConnection } from "@/services/queue/connection";

/**
 * BullMQ queue for reconciliation (P5.4): `run` executes one Running run created by the admin API
 * (status queries can take minutes — never inside a request); `daily` is the 00:00 scheduler that
 * reconciles yesterday for every partner config with a status-query API.
 */

export const RECON_QUEUE = "payhub-reconciliation";

export type ReconJob = { kind: "run"; runId: number } | { kind: "daily"; day?: string };

const globalForQueue = globalThis as unknown as { payhubReconQueue?: Queue<ReconJob> };

export function getReconQueue(): Queue<ReconJob> {
  if (!globalForQueue.payhubReconQueue) {
    const queue = new Queue<ReconJob>(RECON_QUEUE, {
      connection: queueConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 7 * 86400, count: 1000 },
        removeOnFail: { age: 30 * 86400, count: 1000 },
      },
    });
    queue.on("error", (err) => console.error(`[recon-queue] ${describeError(err)}`));
    globalForQueue.payhubReconQueue = queue;
  }
  return globalForQueue.payhubReconQueue;
}

export async function enqueueReconRun(runId: number): Promise<void> {
  await getReconQueue().add("run", { kind: "run", runId }, { jobId: `run-${runId}` });
}
