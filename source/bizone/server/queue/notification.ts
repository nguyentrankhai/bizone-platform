import { Queue, type ConnectionOptions } from "bullmq";
import { currentTenantId } from "@/lib/tenant";
import type { ExportReportInput } from "@/lib/validators/report";

/**
 * Notification work that must not run inside a request: email / SMS / push for a notification,
 * marketing campaigns, report emails, and the schedulers (shift reminders, debts, pre-orders,
 * periodic report, 30-day cleanup). Producer side only — the worker lives in
 * notificationWorker.ts (imported by server/worker.ts, never by Next).
 */
export const NOTIFICATION_QUEUE = "bizone-notification";

export type NotificationJob =
  | { kind: "deliver"; tenantId: string; notificationId: string }
  | { kind: "campaign"; tenantId: string; campaignId: number }
  | {
      kind: "report-email";
      tenantId: string;
      requestedBy: string;
      to: string[];
      input: ExportReportInput;
    }
  /** Schedulers: run for every tenant */
  | { kind: "scan" }
  | { kind: "daily" }
  | { kind: "report" }
  | { kind: "cleanup" };

export function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as {
  bizoneNotificationQueue?: Queue<NotificationJob>;
};

export function getNotificationQueue(): Queue<NotificationJob> {
  if (!globalForQueue.bizoneNotificationQueue) {
    const queue = new Queue<NotificationJob>(NOTIFICATION_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queue.on("error", (err) => console.error(`[queue:notification] ${err.message}`));
    globalForQueue.bizoneNotificationQueue = queue;
  }
  return globalForQueue.bizoneNotificationQueue;
}

/** Email / SMS / push of one notification (never fails the caller) */
export async function enqueueDelivery(notificationId: bigint): Promise<void> {
  try {
    await getNotificationQueue().add("deliver", {
      kind: "deliver",
      tenantId: currentTenantId(),
      notificationId: notificationId.toString(),
    });
  } catch (err) {
    console.error("[queue:notification] enqueue failed:", err instanceof Error ? err.message : err);
  }
}

/** Campaign send job; `delayMs` > 0 for a scheduled campaign. Job id = campaign (one at a time). */
export async function enqueueCampaign(campaignId: number, delayMs: number): Promise<void> {
  const tenantId = currentTenantId();
  const jobId = `campaign-${tenantId}-${campaignId}-${Date.now()}`;
  await getNotificationQueue().add(
    "campaign",
    { kind: "campaign", tenantId, campaignId },
    { jobId, delay: Math.max(0, delayMs), attempts: 1 },
  );
}

export async function enqueueReportEmail(
  input: ExportReportInput,
  to: string[],
  requestedBy: string,
): Promise<string> {
  const job = await getNotificationQueue().add(
    "report-email",
    { kind: "report-email", tenantId: currentTenantId(), requestedBy, to, input },
    { attempts: 2 },
  );
  return job.id!;
}
