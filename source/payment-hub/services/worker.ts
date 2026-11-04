import { Worker } from "bullmq";
import { describeError } from "@/lib/redis";
import { queueConnection } from "./queue/connection";
import { QUEUE_NAMES } from "./queue/queues";
import { deliverWebhook, type WebhookJob } from "./webhook/deliver";
import { runExpireJob } from "@/server/jobs/expireTransactions";
import { runExpireQrJob } from "@/server/jobs/expireQrCodes";

const webhookWorker = new Worker<WebhookJob>(QUEUE_NAMES.webhookDelivery, deliverWebhook, {
  connection: queueConnection(),
  concurrency: 10,
});

webhookWorker.on("completed", (job) => {
  console.log(`[worker] ${job.queueName} #${job.id} delivered (${job.data.event})`);
});

webhookWorker.on("failed", (job, err) => {
  console.error(
    `[worker] ${job?.queueName} #${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`,
  );
});

webhookWorker.on("error", (err) => {
  console.error(`[worker] ${describeError(err)}`);
});

webhookWorker
  .waitUntilReady()
  .then(() => console.log(`[worker] listening on queue "${QUEUE_NAMES.webhookDelivery}"`))
  .catch((err) => {
    console.error("[worker] failed to connect to Redis:", err);
    process.exit(1);
  });

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
