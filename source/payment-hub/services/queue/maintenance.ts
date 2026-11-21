import { Queue, type Job } from "bullmq";
import { describeError, getRedis, withLock } from "@/lib/redis";
import { queueOptions } from "@/services/queue/connection";

/**
 * Periodic jobs (P7.4). Before, every worker process ran its own `setInterval`s — with several
 * worker instances each sweep ran N times. Now each task is a BullMQ job scheduler on
 * `payhub-maintenance`: one job per tick for the whole deployment, taken by whichever worker is
 * free. A Redis lock per task also stops a slow run from overlapping the next tick.
 */

export const MAINTENANCE_QUEUE = "payhub-maintenance";

/** Hash task → epoch ms of the last completed run (P7.5 health check). */
export const MAINTENANCE_LAST_RUN_KEY = "payhub:{hb}:maintenance";
/** Field of that hash: when a worker last (re)registered the schedulers. */
export const SCHEDULED_AT_FIELD = "_scheduledAt";

export type MaintenanceTask =
  "webhook-outbox" | "expiry" | "connector-health" | "retention" | "archive";

export interface MaintenanceJob {
  task: MaintenanceTask;
}

export interface TaskSchedule {
  task: MaintenanceTask;
  /** BullMQ repeat options: `every` (ms) or a cron `pattern` in Vietnam time */
  every?: number;
  pattern?: string;
  /** Lock TTL — longest a run may take before another worker may start the same task */
  lockMs: number;
}

function seconds(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function taskSchedules(): TaskSchedule[] {
  const healthMs = seconds("CONNECTOR_HEALTH_INTERVAL_S", 300) * 1000;
  return [
    // Webhook outbox: dispatch transaction events nobody enqueued (Redis was down, crash…)
    { task: "webhook-outbox", every: 30_000, lockMs: 5 * 60_000 },
    // PSP status sync for overdue Pending payments / async refunds, then expire transactions + QR
    { task: "expiry", every: 60_000, lockMs: 10 * 60_000 },
    // Connector Health Monitor (P7.1)
    { task: "connector-health", every: healthMs, lockMs: Math.max(healthMs - 1000, 1000) },
    // Audit (≥ 90 days, P7.2) + notification (30 days, P7.3) retention
    { task: "retention", pattern: "15 2 * * *", lockMs: 60 * 60_000 },
    // Move old final transactions to the partitioned archive (P7.4)
    {
      task: "archive",
      pattern: process.env.TXN_ARCHIVE_CRON || "45 2 * * *",
      lockMs: 3 * 60 * 60_000,
    },
  ];
}

const globalForQueue = globalThis as unknown as { payhubMaintenanceQueue?: Queue<MaintenanceJob> };

export function getMaintenanceQueue(): Queue<MaintenanceJob> {
  if (!globalForQueue.payhubMaintenanceQueue) {
    const queue = new Queue<MaintenanceJob>(MAINTENANCE_QUEUE, {
      ...queueOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { age: 7 * 86400, count: 500 },
      },
    });
    queue.on("error", (err) => console.error(`[maintenance-queue] ${describeError(err)}`));
    globalForQueue.payhubMaintenanceQueue = queue;
  }
  return globalForQueue.payhubMaintenanceQueue;
}

/** Idempotent: upserting the same scheduler id from several workers keeps one schedule. */
export async function scheduleMaintenance(): Promise<void> {
  const queue = getMaintenanceQueue();
  // P7.5: a task that has not run yet is only "stalled" once its limit passed since scheduling
  await getRedis()
    .hset(MAINTENANCE_LAST_RUN_KEY, SCHEDULED_AT_FIELD, String(Date.now()))
    .catch(() => {});
  for (const s of taskSchedules()) {
    await queue.upsertJobScheduler(
      s.task,
      s.every ? { every: s.every } : { pattern: s.pattern, tz: "Asia/Ho_Chi_Minh" },
      { name: s.task, data: { task: s.task } },
    );
  }
}

export type TaskRunner = (task: MaintenanceTask) => Promise<unknown>;

/** Processor for the maintenance worker: one run at a time per task across the deployment. */
export function maintenanceProcessor(run: TaskRunner) {
  const locks = new Map(taskSchedules().map((s) => [s.task, s.lockMs]));
  return async (job: Job<MaintenanceJob>): Promise<unknown> => {
    const { task } = job.data;
    const result = await withLock(`maintenance:${task}`, locks.get(task) ?? 60_000, () =>
      run(task),
    );
    if (result === undefined) return { skipped: "locked" };
    // P7.5: last completed run per task — the health check flags a stalled scheduler
    await getRedis()
      .hset(MAINTENANCE_LAST_RUN_KEY, task, String(Date.now()))
      .catch(() => {});
    return result;
  };
}
