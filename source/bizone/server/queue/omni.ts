import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { runWithTenant, tenantRegistry } from "@/lib/tenant";
import { expireUnpaidOrders } from "@/server/services/omni/storeOrder.service";

/**
 * Omni Channel background work (P6.1): every minute, website orders still unpaid past their
 * online-payment deadline are cancelled and their stock released (Payment Hub is asked once
 * more first). Runs for every tenant.
 */
export const OMNI_QUEUE = "bizone-omni";

export type OmniJob = { kind: "expire-unpaid" };

function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { bizoneOmniQueue?: Queue<OmniJob> };

export function getOmniQueue(): Queue<OmniJob> {
  if (!globalForQueue.bizoneOmniQueue) {
    const queue = new Queue<OmniJob>(OMNI_QUEUE, {
      connection: connection(),
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
    });
    queue.on("error", (err) => console.error(`[queue:omni] ${err.message}`));
    globalForQueue.bizoneOmniQueue = queue;
  }
  return globalForQueue.bizoneOmniQueue;
}

export async function processOmniJob(job: Job<OmniJob>) {
  if (job.data.kind !== "expire-unpaid") return null;
  const results: Record<string, unknown> = {};
  for (const tenantId of tenantRegistry().keys()) {
    try {
      results[tenantId] = await runWithTenant(tenantId, () => expireUnpaidOrders());
    } catch (err) {
      console.error(`[worker:omni] expire ${tenantId} failed:`, err);
    }
  }
  return results;
}

export async function startOmniWorker(): Promise<Worker<OmniJob>> {
  await getOmniQueue().upsertJobScheduler(
    "omni-expire-unpaid",
    { every: 60_000 },
    { name: "expire-unpaid", data: { kind: "expire-unpaid" } },
  );
  const worker = new Worker<OmniJob>(OMNI_QUEUE, processOmniJob, {
    connection: connection(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:omni] job ${job?.id} failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:omni] ${err.message}`));
  return worker;
}
