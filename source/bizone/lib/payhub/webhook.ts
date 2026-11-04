import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verification of webhooks sent by Payment Hub (P3.6):
 *   X-Signature = hex(HMAC-SHA256(secret, `${X-Timestamp}.${raw body}`)), X-Timestamp unix seconds.
 * The secret is the endpoint secret shown once by Payment Hub (env PAYHUB_WEBHOOK_SECRET).
 */

export const MAX_SKEW_SECONDS = 300;

export function verifyPayhubSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function isFreshTimestamp(timestamp: string, nowMs = Date.now()): boolean {
  if (!/^\d{9,11}$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= MAX_SKEW_SECONDS;
}
