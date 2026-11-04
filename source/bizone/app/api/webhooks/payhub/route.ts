import { getRedis } from "@/lib/redis";
import { isFreshTimestamp, verifyPayhubSignature } from "@/lib/payhub/webhook";

/**
 * POST /api/webhooks/payhub — receives Payment Hub events (payment.success / failed / expired,
 * refund.completed, webhook.ping). Public route (no JWT): authenticated by the HMAC signature.
 *
 * Payment Hub retries on any non-2xx, so: answer 2xx once the event is safely accepted,
 * de-duplicate on X-Webhook-Id (retries and replays reuse it). Applying events to invoices/orders
 * is P4.5 (POS ↔ Payment Hub); for now accepted events are logged.
 */

const DEDUPE_TTL_SECONDS = 7 * 86400;

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.PAYHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[payhub-webhook] PAYHUB_WEBHOOK_SECRET is not set");
    return reply(503, {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Webhook not configured" },
    });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-timestamp") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  const webhookId = req.headers.get("x-webhook-id") ?? "";
  const event = req.headers.get("x-webhook-event") ?? "";

  if (!isFreshTimestamp(timestamp)) {
    return reply(401, {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Stale or missing timestamp" },
    });
  }
  if (!verifyPayhubSignature(secret, timestamp, rawBody, signature)) {
    return reply(401, {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid signature" },
    });
  }
  if (!/^[0-9a-f-]{36}$/i.test(webhookId)) {
    return reply(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing X-Webhook-Id" },
    });
  }

  let payload: { event?: string; transaction_id?: string; merchant_txn_id?: string | null };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return reply(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid JSON" },
    });
  }
  if (payload.event !== event) {
    return reply(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Event mismatch" },
    });
  }

  const first = await getRedis().set(
    `bizone:payhub:webhook:${webhookId}`,
    "1",
    "EX",
    DEDUPE_TTL_SECONDS,
    "NX",
  );
  if (first !== "OK") {
    return reply(200, { success: true, data: { received: true, duplicate: true } });
  }

  console.log(
    `[payhub-webhook] ${event} ${payload.transaction_id ?? ""} (merchant txn ${payload.merchant_txn_id ?? "-"}) id=${webhookId}`,
  );
  return reply(200, { success: true, data: { received: true, duplicate: false } });
}
