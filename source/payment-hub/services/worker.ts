import { Worker } from "bullmq";
import { getPrisma } from "@/lib/prisma";
import { describeError } from "@/lib/redis";
import { runHealthMonitor } from "@/server/services/connector.service";
import { disposeCatalog } from "@/services/connectors/loader";
import { purgeAuditLogs, retentionDays } from "@/services/audit/logger";
import { queueOptions } from "./queue/connection";
import { parseWorkerRoles, workerConcurrency } from "./queue/roles";
import {
  MAINTENANCE_QUEUE,
  maintenanceProcessor,
  scheduleMaintenance,
  type MaintenanceJob,
  type MaintenanceTask,
} from "./queue/maintenance";
import { runArchiveTransactions } from "@/server/jobs/archiveTransactions";
import { WEBHOOK_QUEUE, webhookBackoff, type WebhookJob } from "./webhook/queue";
import { processWebhookJob } from "./webhook/deliver";
import { sweepWebhookOutbox } from "@/server/services/webhook.service";
import { runExpireJob } from "@/server/jobs/expireTransactions";
import { runExpireQrJob } from "@/server/jobs/expireQrCodes";
import { runSyncPendingPayments } from "@/server/jobs/syncPendingPayments";
import { runSyncPendingRefunds } from "@/server/jobs/syncPendingRefunds";
import {
  processReconciliationJob,
  scheduleDailyReconciliation,
} from "@/server/jobs/dailyReconciliation";
import { RECON_QUEUE, type ReconJob } from "./reconciliation/queue";
import { DISPUTE_QUEUE, type DisputeJob } from "./dispute/queue";
import { sendDisputeResultNotification } from "@/server/services/dispute.service";
import {
  NOTIFICATION_QUEUE,
  markEmailFailed,
  processNotificationJob,
  type NotificationJob,
} from "@/server/jobs/notificationQueue";
import { purgeNotifications } from "@/services/notification/sender";
import { NOTIFICATION_RETENTION_DAYS } from "@/services/notification/events";

const roles = parseWorkerRoles(process.env.WORKER_QUEUES);
console.log(`[worker] pid ${process.pid} — queues: ${[...roles].join(", ")}`);

/** Same listeners for every queue: errors logged, process exits if Redis is unreachable at start. */
function started<T extends Worker>(worker: T, label: string): T {
  worker.on("error", (err) => console.error(`[${label}] ${describeError(err)}`));
  worker
    .waitUntilReady()
    .then(() =>
      console.log(`[worker] listening on queue "${worker.name}" (${worker.opts.concurrency})`),
    )
    .catch((err) => {
      console.error(`[worker] failed to connect to Redis (${label}):`, err);
      process.exit(1);
    });
  return worker;
}

// Webhooks (P3.6). Several worker instances may consume the queue: BullMQ hands each job to one
// worker; the delivery id stays the same across retries / instances (X-Webhook-Id).
const webhookWorker = roles.has("webhook")
  ? started(
      new Worker<WebhookJob>(WEBHOOK_QUEUE, processWebhookJob, {
        ...queueOptions(),
        concurrency: workerConcurrency("webhook"),
        settings: {
          backoffStrategy: (attemptsMade, _type, _err, job) =>
            webhookBackoff(attemptsMade, job as { data: WebhookJob } | undefined),
        },
      }),
      "webhook",
    )
  : null;
if (webhookWorker && process.env.WORKER_LOG_DELIVERIES !== "false") {
  webhookWorker.on("completed", (job) => {
    console.log(`[worker] webhook ${job.data.event} #${job.id} delivered`);
  });
}
webhookWorker?.on("failed", (job, err) => {
  console.error(`[worker] webhook #${job?.id} attempt ${job?.attemptsMade}: ${err.message}`);
});

// Reconciliation (P5.4): runs started from the admin UI + daily 00:00 (VN) scheduler.
const reconWorker = roles.has("recon")
  ? started(
      new Worker<ReconJob>(RECON_QUEUE, processReconciliationJob, {
        ...queueOptions(),
        concurrency: workerConcurrency("recon"),
        lockDuration: 10 * 60_000,
      }),
      "recon",
    )
  : null;
reconWorker?.on("failed", (job, err) =>
  console.error(`[recon] job ${job?.name} #${job?.id} failed: ${err.message}`),
);
if (reconWorker) {
  void scheduleDailyReconciliation()
    .then(() => console.log(`[worker] reconciliation scheduled (queue "${RECON_QUEUE}")`))
    .catch((err: unknown) =>
      console.error("[recon] scheduler:", err instanceof Error ? err.message : err),
    );
}

// Dispute result notifications (P5.6): e-mail to the creator + DISPUTE_NOTIFY_EMAILS, retried
// by BullMQ (4 attempts, exponential back-off) on SMTP errors.
const disputeWorker = roles.has("dispute")
  ? started(
      new Worker<DisputeJob>(
        DISPUTE_QUEUE,
        async (job) => sendDisputeResultNotification(job.data.disputeId),
        { ...queueOptions(), concurrency: workerConcurrency("dispute") },
      ),
      "dispute",
    )
  : null;
disputeWorker?.on("completed", (job, result) =>
  console.log(`[dispute] notify #${job.data.disputeId}: ${String(result)}`),
);
disputeWorker?.on("failed", (job, err) => {
  console.error(
    `[dispute] notify #${job?.data.disputeId} attempt ${job?.attemptsMade}: ${err.message}`,
  );
  // Last attempt failed → keep a trace on the dispute timeline
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void getPrisma()
      .disputeLog.create({
        data: {
          disputeId: job.data.disputeId,
          action: "notify_failed",
          note: `Không gửi được email kết quả: ${err.message}`.slice(0, 2000),
          createdBy: "system:notify",
        },
      })
      .catch(() => {});
  }
});

// Notification e-mails (P7.3)
const notificationWorker = roles.has("notification")
  ? started(
      new Worker<NotificationJob>(NOTIFICATION_QUEUE, processNotificationJob, {
        ...queueOptions(),
        concurrency: workerConcurrency("notification"),
      }),
      "notification",
    )
  : null;
notificationWorker?.on("completed", (job, result) =>
  console.log(`[notification] email #${job.data.notificationId}: ${String(result)}`),
);
notificationWorker?.on("failed", (job, err) => {
  console.error(
    `[notification] email #${job?.data.notificationId} attempt ${job?.attemptsMade}: ${err.message}`,
  );
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void markEmailFailed(job.data.notificationId, err.message);
  }
});

// Periodic jobs (P7.4): BullMQ job schedulers on "payhub-maintenance" — one run per tick for the
// whole deployment however many worker instances are up (was one setInterval per process).
async function runMaintenanceTask(task: MaintenanceTask): Promise<unknown> {
  switch (task) {
    case "webhook-outbox": {
      const n = await sweepWebhookOutbox();
      if (n > 0) console.log(`[webhook-outbox] enqueued ${n} delivery(ies)`);
      return { enqueued: n };
    }
    case "expiry":
      // PSP status of Pending transactions whose IPN is overdue (lost / failed IPN), asynchronous
      // refunds still Processing, then overdue transactions and their QR codes
      await runSyncPendingPayments().catch((err: unknown) =>
        console.error("[status-sync] error:", err instanceof Error ? err.message : err),
      );
      await runSyncPendingRefunds().catch((err: unknown) =>
        console.error("[refund-sync] error:", err instanceof Error ? err.message : err),
      );
      await runExpireJob().catch((err: unknown) =>
        console.error("[expire-job] error:", err instanceof Error ? err.message : err),
      );
      await runExpireQrJob().catch((err: unknown) =>
        console.error("[qr-expire-job] error:", err instanceof Error ? err.message : err),
      );
      return { ok: true };
    case "connector-health": {
      // Connector Health Monitor (P7.1, SRS-PH-PARTNER-02-11)
      const { checked, unhealthy } = await runHealthMonitor();
      if (checked > 0) {
        console.log(
          `[connector-health] ${checked} checked${unhealthy.length ? `, unhealthy: ${unhealthy.join(", ")}` : ""}`,
        );
      }
      return { checked, unhealthy };
    }
    case "retention": {
      // P7.2: audit_logs older than AUDIT_RETENTION_DAYS (≥ 90) — the DB triggers refuse anything
      // younger; transaction journals stay with their transactions. P7.3: notifications 30 days.
      const n = await purgeAuditLogs();
      if (n > 0)
        console.log(`[audit-retention] deleted ${n} entries older than ${retentionDays()} days`);
      const m = await purgeNotifications(new Date(), NOTIFICATION_RETENTION_DAYS);
      if (m > 0) console.log(`[notification-retention] deleted ${m} notifications`);
      return { audit: n, notifications: m };
    }
    case "archive": {
      const r = await runArchiveTransactions();
      if (r.archived > 0 || r.droppedPartitions.length > 0) {
        console.log(
          `[archive] ${r.archived} transaction(s) archived (before ${r.cutoff.toISOString().slice(0, 10)})${r.droppedPartitions.length ? `, dropped ${r.droppedPartitions.join(", ")}` : ""}`,
        );
      }
      return r;
    }
  }
}

const maintenanceWorker = roles.has("maintenance")
  ? new Worker<MaintenanceJob>(MAINTENANCE_QUEUE, maintenanceProcessor(runMaintenanceTask), {
      ...queueOptions(),
      concurrency: 5, // the five tasks may run side by side; each one is locked across workers
      lockDuration: 5 * 60_000,
    })
  : null;
maintenanceWorker?.on("failed", (job, err) =>
  console.error(`[maintenance] ${job?.data.task} failed: ${err.message}`),
);
maintenanceWorker?.on("error", (err) => console.error(`[maintenance] ${describeError(err)}`));
if (maintenanceWorker) {
  void scheduleMaintenance()
    .then(() => console.log(`[worker] maintenance scheduled (queue "${MAINTENANCE_QUEUE}")`))
    .catch((err: unknown) =>
      console.error("[maintenance] scheduler:", err instanceof Error ? err.message : err),
    );
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, draining…`);
  // close() waits for Redis; exit before Docker's 10s SIGKILL if Redis is unreachable.
  setTimeout(() => process.exit(1), 8000).unref();
  await Promise.all(
    [webhookWorker, reconWorker, disputeWorker, notificationWorker, maintenanceWorker].map((w) =>
      w?.close(),
    ),
  );
  disposeCatalog();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
