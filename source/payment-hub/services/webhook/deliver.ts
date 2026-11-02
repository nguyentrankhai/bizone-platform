import { createHmac } from "node:crypto";
import type { Job } from "bullmq";

export type WebhookJob = {
  url: string;
  secret: string;
  event: string;
  payload: unknown;
};

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

// Throwing on a non-2xx response lets BullMQ retry with the queue's backoff policy.
export async function deliverWebhook(job: Job<WebhookJob>): Promise<{ status: number }> {
  const { url, secret, event, payload } = job.data;
  const body = JSON.stringify({ event, data: payload });
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payhub-event": event,
      "x-payhub-delivery": String(job.id),
      "x-payhub-timestamp": timestamp,
      "x-payhub-signature": signWebhook(secret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Webhook ${url} responded ${res.status}`);
  return { status: res.status };
}
