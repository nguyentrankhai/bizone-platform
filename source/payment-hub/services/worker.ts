import { Worker } from "bullmq";
import { getPrisma } from "@/lib/prisma";
import { describeError } from "@/lib/redis";
import { queueConnection } from "./queue/connection";
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

const webhookWorker = new Worker<WebhookJob>(WEBHOOK_QUEUE, processWebhookJob, {
  connection: queueConnection(),
  concurrency: 10,
  settings: {
    backoffStrategy: (attemptsMade, _type, _err, job) =>
      webhookBackoff(attemptsMade, job as { data: WebhookJob } | undefined),
  },
});

webhookWorker.on("completed", (job) => {
  console.log(`[worker] webhook ${job.data.event} #${job.id} delivered`);
});

webhookWorker.on("failed", (job, err) => {
  console.error(`[worker] webhook #${job?.id} attempt ${job?.attemptsMade}: ${err.message}`);
});

webhookWorker.on("error", (err) => {
  console.error(`[worker] ${describeError(err)}`);
});

webhookWorker
  .waitUntilReady()
  .then(() => console.log(`[worker] listening on queue "${WEBHOOK_QUEUE}"`))
  .catch((err) => {
    console.error("[worker] failed to connect to Redis:", err);
    process.exit(1);
  });

// Reconciliation (P5.4): runs started from the admin UI + daily 00:00 (VN) scheduler.
// Concurrency 1: a run may issue thousands of PSP status queries.
const reconWorker = new Worker<ReconJob>(RECON_QUEUE, processReconciliationJob, {
  connection: queueConnection(),
  concurrency: 1,
  lockDuration: 10 * 60_000,
});
reconWorker.on("failed", (job, err) =>
  console.error(`[recon] job ${job?.name} #${job?.id} failed: ${err.message}`),
);
reconWorker.on("error", (err) => console.error(`[recon] ${describeError(err)}`));
void scheduleDailyReconciliation()
  .then(() => console.log(`[worker] reconciliation scheduled (queue "${RECON_QUEUE}")`))
  .catch((err: unknown) =>
    console.error("[recon] scheduler:", err instanceof Error ? err.message : err),
  );

// Dispute result notifications (P5.6): e-mail to the creator + DISPUTE_NOTIFY_EMAILS, retried
// by BullMQ (4 attempts, exponential back-off) on SMTP errors.
const disputeWorker = new Worker<DisputeJob>(
  DISPUTE_QUEUE,
  async (job) => sendDisputeResultNotification(job.data.disputeId),
  { connection: queueConnection(), concurrency: 2 },
);
disputeWorker.on("completed", (job, result) =>
  console.log(`[dispute] notify #${job.data.disputeId}: ${String(result)}`),
);
disputeWorker.on("failed", (job, err) => {
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
disputeWorker.on("error", (err) => console.error(`[dispute] ${describeError(err)}`));

// Webhook outbox sweeper: dispatch transaction events nobody enqueued (Redis was down, crash…)
const OUTBOX_INTERVAL_MS = 30_000;
setInterval(() => {
  sweepWebhookOutbox()
    .then((n) => n > 0 && console.log(`[webhook-outbox] enqueued ${n} delivery(ies)`))
    .catch((err: unknown) =>
      console.error("[webhook-outbox] error:", err instanceof Error ? err.message : err),
    );
}, OUTBOX_INTERVAL_MS);

// Query the PSP for Pending transactions whose IPN is overdue (lost / failed IPN) and for
// asynchronous refunds still Processing, then expire overdue transactions and their QR codes —
// every minute
const EXPIRE_INTERVAL_MS = 60_000;
async function runExpiryJobs(): Promise<void> {
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
}
setInterval(() => void runExpiryJobs(), EXPIRE_INTERVAL_MS);

// Run once at startup to catch anything that expired while the worker was down
void runExpiryJobs();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, draining…`);
  // close() waits for Redis; exit before Docker's 10s SIGKILL if Redis is unreachable.
  setTimeout(() => process.exit(1), 8000).unref();
  await Promise.all([webhookWorker.close(), reconWorker.close(), disputeWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
