import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { publishLowStockAlerts } from "@/server/services/inventory.service";

/**
 * Post-sale inventory work that must not slow down checkout.
 * Stock itself is decremented inside the invoice DB transaction (so it can never
 * oversell); the queue only runs the follow-ups — low-stock alerts for now.
 */
export const INVENTORY_QUEUE = "bizone-inventory";

export interface StockChangedJob {
  warehouseId: number;
  productIds: number[];
  reason: "sale" | "refund" | "cancel";
  invoiceId: number;
}

// BullMQ workers need maxRetriesPerRequest: null so blocking commands are never aborted
function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { bizoneInventoryQueue?: Queue<StockChangedJob> };

export function getInventoryQueue(): Queue<StockChangedJob> {
  if (!globalForQueue.bizoneInventoryQueue) {
    const queue = new Queue<StockChangedJob>(INVENTORY_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queue.on("error", (err) => console.error(`[queue:inventory] ${err.message}`));
    globalForQueue.bizoneInventoryQueue = queue;
  }
  return globalForQueue.bizoneInventoryQueue;
}

/** Enqueue without failing the caller: a sale is already committed when this runs */
export async function enqueueStockChanged(job: StockChangedJob): Promise<void> {
  try {
    await getInventoryQueue().add("stock-changed", job);
  } catch (err) {
    console.error("[queue:inventory] enqueue failed:", err instanceof Error ? err.message : err);
  }
}

export async function processStockChanged(job: Job<StockChangedJob>): Promise<void> {
  await publishLowStockAlerts(job.data.warehouseId, job.data.productIds);
}

export function startInventoryWorker(): Worker<StockChangedJob> {
  const worker = new Worker<StockChangedJob>(INVENTORY_QUEUE, processStockChanged, {
    connection: connection(),
    concurrency: 5,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:inventory] job ${job?.id} failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:inventory] ${err.message}`));
  return worker;
}
