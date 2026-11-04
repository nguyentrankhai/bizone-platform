import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * HTTP delivery of one webhook attempt — signs, sends, captures the response. No DB, no queue.
 *
 * Headers sent to the merchant:
 *   X-Webhook-Id     delivery id (same for every retry/replay → de-duplicate on it)
 *   X-Webhook-Event  event code
 *   X-Timestamp      unix seconds
 *   X-Signature      hex(HMAC-SHA256(secret, `${X-Timestamp}.${raw body}`))
 * Merchants should reject timestamps older than 5 minutes (replay protection).
 */

const MAX_RESPONSE_BODY = 2000;
const USER_AGENT = "BizOne-PaymentHub-Webhook/1.0";

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhook(secret, timestamp, body), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(expected, given);
}

export interface SendInput {
  url: string;
  secret: string;
  event: string;
  deliveryId: string;
  /** Serialized JSON body — signed byte-for-byte as sent. */
  body: string;
  timeoutMs: number;
}

export interface SendResult {
  ok: boolean;
  /** false → do not retry (bad URL, blocked destination…) */
  retryable: boolean;
  status: number | null;
  durationMs: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  error: string | null;
}

// ─── SSRF guard ───────────────────────────────────────────────────────────────

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Webhook URLs come from merchants (transactions.webhook_url) and admins — never let them reach
 * the internal network unless explicitly allowed (dev: BizOne runs on localhost).
 */
export async function assertDeliverableUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Webhook URL must be http(s)");
  }
  if (process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true") return;
  if (url.protocol !== "https:") throw new Error("Webhook URL must use https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.some(isPrivateAddress)) {
    throw new Error("Webhook URL resolves to a private network address");
  }
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendWebhook(input: SendInput): Promise<SendResult> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-Webhook-Id": input.deliveryId,
    "X-Webhook-Event": input.event,
    "X-Timestamp": timestamp,
    "X-Signature": signWebhook(input.secret, timestamp, input.body),
  };
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  try {
    await assertDeliverableUrl(input.url);
  } catch (e) {
    return {
      ok: false,
      retryable: false,
      status: null,
      durationMs: 0,
      requestHeaders,
      responseHeaders: null,
      responseBody: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const res = await fetch(input.url, {
      method: "POST",
      headers: requestHeaders,
      body: input.body,
      redirect: "manual", // a redirect could point inside the network — treat as failure
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.status >= 200 && res.status < 300,
      retryable: true,
      status: res.status,
      durationMs: elapsed(),
      requestHeaders,
      responseHeaders: Object.fromEntries(res.headers.entries()),
      responseBody: text.slice(0, MAX_RESPONSE_BODY),
      error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const message =
      err.name === "TimeoutError"
        ? `Timeout after ${input.timeoutMs} ms`
        : (err.cause?.code ?? err.message);
    return {
      ok: false,
      retryable: true,
      status: null,
      durationMs: elapsed(),
      requestHeaders,
      responseHeaders: null,
      responseBody: null,
      error: message,
    };
  }
}
