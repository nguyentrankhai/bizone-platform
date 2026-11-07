import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { currentTenantId, runWithTenant, tenantRegistry } from "@/lib/tenant";
import { vnMonthKey } from "@/lib/vn-time";
import { recalculateAll, recalculateMonth } from "@/server/services/commission.service";

/**
 * Commission follow-ups that must not slow down checkout:
 * - "recalc": one seller-month after a sale / cancel / refund;
 * - "month-end": scheduler at 00:30 VN on the 1st — settles the previous month for every
 *   tenant (min_revenue thresholds depend on the whole month).
 * The worker runs with concurrency 1 so two recalcs of the same seller-month never interleave.
 */
export const COMMISSION_QUEUE = "bizone-commission";

export type CommissionJob =
  { kind: "recalc"; tenantId: string; userId: number; month: string } | { kind: "month-end" };

function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { bizoneCommissionQueue?: Queue<CommissionJob> };

export function getCommissionQueue(): Queue<CommissionJob> {
  if (!globalForQueue.bizoneCommissionQueue) {
    const queue = new Queue<CommissionJob>(COMMISSION_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queue.on("error", (err) => console.error(`[queue:commission] ${err.message}`));
    globalForQueue.bizoneCommissionQueue = queue;
  }
  return globalForQueue.bizoneCommissionQueue;
}

/** Enqueue without failing the caller (the sale is already committed) */
export async function enqueueCommissionRecalc(
  userId: number,
  invoiceCreatedAt: Date,
): Promise<void> {
  try {
    await getCommissionQueue().add("recalc", {
      kind: "recalc",
      tenantId: currentTenantId(),
      userId,
      month: vnMonthKey(invoiceCreatedAt),
    });
  } catch (err) {
    console.error("[queue:commission] enqueue failed:", err instanceof Error ? err.message : err);
  }
}

/** Previous VN month of an instant */
export function previousMonth(now: Date): string {
  const [y, m] = vnMonthKey(now).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function processCommissionJob(job: Job<CommissionJob>) {
  const data = job.data;
  if (data.kind === "recalc") {
    return runWithTenant(data.tenantId, () => recalculateMonth(data.userId, data.month));
  }
  const month = previousMonth(new Date());
  const results = [];
  for (const tenantId of tenantRegistry().keys()) {
    try {
      results.push({ tenantId, ...(await runWithTenant(tenantId, () => recalculateAll(month))) });
    } catch (err) {
      console.error(`[worker:commission] month-end ${tenantId} ${month} failed:`, err);
    }
  }
  return results;
}

export async function startCommissionWorker(): Promise<Worker<CommissionJob>> {
  await getCommissionQueue().upsertJobScheduler(
    "commission-month-end",
    { pattern: "30 0 1 * *", tz: "Asia/Ho_Chi_Minh" },
    { name: "month-end", data: { kind: "month-end" } },
  );
  const worker = new Worker<CommissionJob>(COMMISSION_QUEUE, processCommissionJob, {
    connection: connection(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:commission] job ${job?.id} failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:commission] ${err.message}`));
  return worker;
}
