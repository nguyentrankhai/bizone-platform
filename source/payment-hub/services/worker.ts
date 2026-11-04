import { Worker } from "bullmq";
import { describeError } from "@/lib/redis";
import { queueConnection } from "./queue/connection";
import { WEBHOOK_QUEUE, webhookBackoff, type WebhookJob } from "./webhook/queue";
import { processWebhookJob } from "./webhook/deliver";
import { sweepWebhookOutbox } from "@/server/services/webhook.service";
import { runExpireJob } from "@/server/jobs/expireTransactions";
import { runExpireQrJob } from "@/server/jobs/expireQrCodes";

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

// Webhook outbox sweeper: dispatch transaction events nobody enqueued (Redis was down, crash…)
const OUTBOX_INTERVAL_MS = 30_000;
setInterval(() => {
  sweepWebhookOutbox()
    .then((n) => n > 0 && console.log(`[webhook-outbox] enqueued ${n} delivery(ies)`))
    .catch((err: unknown) =>
      console.error("[webhook-outbox] error:", err instanceof Error ? err.message : err),
    );
}, OUTBOX_INTERVAL_MS);

// Expire overdue transactions, then their QR codes, every minute
const EXPIRE_INTERVAL_MS = 60_000;
async function runExpiryJobs(): Promise<void> {
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
  await webhookWorker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
