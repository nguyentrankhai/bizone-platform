import { UnrecoverableError, type Job } from "bullmq";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { recordAttempt } from "@/server/services/webhook.service";
import { sendWebhook } from "./sender";
import { webhookBackoff, type WebhookJob } from "./queue";

/**
 * Worker processor: one call = one HTTP attempt = one webhook_logs row.
 * Throwing makes BullMQ retry with the "webhook" backoff (1 min, 5 min, 15 min, 1 h, 6 h by
 * default); UnrecoverableError stops retrying (endpoint removed/disabled, URL not deliverable).
 */
export async function processWebhookJob(job: Job<WebhookJob>): Promise<{ status: number | null }> {
  const { deliveryId, webhookConfigId, url, event, transactionId, body } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;
  const maxRetries = maxAttempts - 1;

  const config = await getPrisma().webhookConfig.findUnique({ where: { id: webhookConfigId } });
  if (!config || config.status !== "Active") {
    throw new UnrecoverableError(
      `Webhook endpoint #${webhookConfigId} ${config ? "is inactive" : "was deleted"} — not sent`,
    );
  }

  const res = await sendWebhook({
    url,
    secret: decryptSecret(config.secret),
    event,
    deliveryId,
    body,
    timeoutMs: config.timeoutMs,
  });

  const willRetry = !res.ok && res.retryable && attempt < maxAttempts;
  await recordAttempt(
    {
      deliveryId,
      webhookConfigId,
      transactionId,
      event,
      url,
      body,
      attempt,
      maxRetries,
      nextRetryAt: willRetry ? new Date(Date.now() + webhookBackoff(attempt, job)) : null,
    },
    res,
  );

  if (res.ok) return { status: res.status };
  const message = `${event} → ${url}: ${res.error ?? "failed"} (attempt ${attempt}/${maxAttempts})`;
  if (!res.retryable) throw new UnrecoverableError(message);
  throw new Error(message);
}
