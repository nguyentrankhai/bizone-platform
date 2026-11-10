import { Worker, type Job } from "bullmq";
import { runWithTenant, tenantRegistry } from "@/lib/tenant";
import {
  connection,
  getNotificationQueue,
  NOTIFICATION_QUEUE,
  type NotificationJob,
} from "./notification";
import { deliverNotification } from "@/server/services/notificationDelivery.service";
import { runCampaign } from "@/server/services/campaign.service";
import { cleanupOld } from "@/server/services/notification.service";
import {
  scanCustomerDebts,
  scanPreorders,
  scanShiftReminders,
  scanSupplierDebts,
} from "@/server/services/notificationScan.service";
import { runScheduledReport, sendReportEmail } from "@/server/services/reportMail.service";

/**
 * Worker side of notifications (only imported by server/worker.ts — keeps nodemailer, web-push,
 * exceljs and pdfmake out of the Next bundle). Schedulers (VN time):
 * - scan     every 5 minutes  → shift reminders
 * - daily    08:00            → customer / supplier debts, pre-orders due
 * - report   07:00            → periodic report email
 * - cleanup  02:15            → delete notifications + delivery log older than 30 days
 */

async function forEachTenant<T>(label: string, fn: () => Promise<T>) {
  const out: Record<string, T | { error: string }> = {};
  for (const tenantId of tenantRegistry().keys()) {
    try {
      out[tenantId] = await runWithTenant(tenantId, fn);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[worker:notification] ${label} ${tenantId} failed: ${error}`);
      out[tenantId] = { error };
    }
  }
  return out;
}

export async function processNotificationJob(job: Job<NotificationJob>) {
  const data = job.data;
  switch (data.kind) {
    case "deliver":
      return runWithTenant(data.tenantId, () => deliverNotification(BigInt(data.notificationId)));
    case "campaign":
      return runWithTenant(data.tenantId, () => runCampaign(data.campaignId));
    case "report-email":
      return runWithTenant(data.tenantId, () =>
        sendReportEmail(data.input, data.to, data.requestedBy),
      );
    case "scan":
      return forEachTenant("scan", () => scanShiftReminders());
    case "daily":
      return forEachTenant("daily", async () => ({
        customerDebts: await scanCustomerDebts(),
        supplierDebts: await scanSupplierDebts(),
        preorders: await scanPreorders(),
      }));
    case "report": {
      // one failing tenant must not block the others; retries only re-send unsent recipients
      const res = await forEachTenant("report", () => runScheduledReport());
      return res;
    }
    case "cleanup":
      return forEachTenant("cleanup", () => cleanupOld());
  }
}

export async function startNotificationWorker(): Promise<Worker<NotificationJob>> {
  const queue = getNotificationQueue();
  const tz = "Asia/Ho_Chi_Minh";
  await queue.upsertJobScheduler(
    "notification-scan",
    { pattern: "*/5 * * * *", tz },
    { name: "scan", data: { kind: "scan" }, opts: { attempts: 1 } },
  );
  await queue.upsertJobScheduler(
    "notification-daily",
    { pattern: "0 8 * * *", tz },
    { name: "daily", data: { kind: "daily" }, opts: { attempts: 1 } },
  );
  await queue.upsertJobScheduler(
    "notification-report",
    { pattern: "0 7 * * *", tz },
    { name: "report", data: { kind: "report" }, opts: { attempts: 1 } },
  );
  await queue.upsertJobScheduler(
    "notification-cleanup",
    { pattern: "15 2 * * *", tz },
    { name: "cleanup", data: { kind: "cleanup" }, opts: { attempts: 1 } },
  );
  const worker = new Worker<NotificationJob>(NOTIFICATION_QUEUE, processNotificationJob, {
    connection: connection(),
    concurrency: 3,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:notification] job ${job?.id} (${job?.name}) failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:notification] ${err.message}`));
  return worker;
}
