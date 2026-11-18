import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { currentTenantId, runWithTenant, tenantRegistry } from "@/lib/tenant";
import { refreshExpiringTokens } from "@/server/services/omni/marketplaceChannel.service";
import {
  pushProducts,
  syncAllChannelStock,
  syncChannelStock,
} from "@/server/services/omni/productSync.service";
import {
  importOrders,
  pollAllChannels,
  pollOrders,
} from "@/server/services/omni/orderSync.service";

/**
 * Marketplace sync (P6.2) — queue "bizone-omni-sync":
 * - `stock-sync` every 10 s: price / stock differences of every listing → marketplaces (< 30 s)
 * - `order-poll` every 2 min: orders updated on the marketplaces (+ retry set)
 * - `token-refresh` every 15 min: tokens expiring within the hour
 * - `product-push` (admin): create listings / push price + stock of chosen products
 * - `order-fetch` (push notification) / `order-sync` (admin button)
 * Jobs carry the tenant; schedulers loop over every tenant. Platform outages retry with backoff.
 */
export const OMNI_SYNC_QUEUE = "bizone-omni-sync";

export type OmniSyncJob =
  | { kind: "stock-sync" | "order-poll" | "token-refresh" }
  | { kind: "product-push"; tenantId: string; channelId: number; productIds?: number[] }
  | { kind: "order-fetch"; tenantId: string; channelId: number; orderIds: string[] }
  | { kind: "order-sync"; tenantId: string; channelId: number }
  | { kind: "stock-push"; tenantId: string; channelId: number; force?: boolean };

function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { bizoneOmniSyncQueue?: Queue<OmniSyncJob> };

export function getOmniSyncQueue(): Queue<OmniSyncJob> {
  if (!globalForQueue.bizoneOmniSyncQueue) {
    const queue = new Queue<OmniSyncJob>(OMNI_SYNC_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 200,
        removeOnFail: 1000,
      },
    });
    queue.on("error", (err) => console.error(`[queue:omni-sync] ${err.message}`));
    globalForQueue.bizoneOmniSyncQueue = queue;
  }
  return globalForQueue.bizoneOmniSyncQueue;
}

/** Enqueue a channel job for the current tenant */
export async function enqueueOmniSync(
  job:
    | { kind: "product-push"; channelId: number; productIds?: number[] }
    | { kind: "order-fetch"; channelId: number; orderIds: string[] }
    | { kind: "order-sync"; channelId: number }
    | { kind: "stock-push"; channelId: number; force?: boolean },
  tenantId = currentTenantId(),
) {
  return getOmniSyncQueue().add(job.kind, { ...job, tenantId } as OmniSyncJob);
}

async function everyTenant(fn: () => Promise<unknown>) {
  const out: Record<string, unknown> = {};
  for (const tenantId of tenantRegistry().keys()) {
    try {
      out[tenantId] = await runWithTenant(tenantId, fn);
    } catch (err) {
      console.error(`[worker:omni-sync] ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function processOmniSyncJob(job: Job<OmniSyncJob>) {
  const d = job.data;
  switch (d.kind) {
    case "stock-sync":
      return everyTenant(syncAllChannelStock);
    case "order-poll":
      return everyTenant(pollAllChannels);
    case "token-refresh":
      return everyTenant(refreshExpiringTokens);
    case "product-push":
      return runWithTenant(d.tenantId, () => pushProducts(d.channelId, d.productIds));
    case "order-fetch":
      return runWithTenant(d.tenantId, () => importOrders(d.channelId, d.orderIds));
    case "order-sync":
      return runWithTenant(d.tenantId, () => pollOrders(d.channelId, { manual: true }));
    case "stock-push":
      return runWithTenant(d.tenantId, () => syncChannelStock(d.channelId, { force: d.force }));
  }
}

export async function startOmniSyncWorker(): Promise<Worker<OmniSyncJob>> {
  const queue = getOmniSyncQueue();
  const scheduled = { attempts: 1, removeOnComplete: 20, removeOnFail: 100 };
  await queue.upsertJobScheduler(
    "omni-stock-sync",
    { every: Number(process.env.OMNI_STOCK_SYNC_MS ?? 10_000) },
    { name: "stock-sync", data: { kind: "stock-sync" }, opts: scheduled },
  );
  await queue.upsertJobScheduler(
    "omni-order-poll",
    { every: Number(process.env.OMNI_ORDER_POLL_MS ?? 120_000) },
    { name: "order-poll", data: { kind: "order-poll" }, opts: scheduled },
  );
  await queue.upsertJobScheduler(
    "omni-token-refresh",
    { every: 15 * 60_000 },
    { name: "token-refresh", data: { kind: "token-refresh" }, opts: scheduled },
  );
  const worker = new Worker<OmniSyncJob>(OMNI_SYNC_QUEUE, processOmniSyncJob, {
    connection: connection(),
    concurrency: 3,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:omni-sync] ${job?.name} ${job?.id} failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:omni-sync] ${err.message}`));
  return worker;
}
