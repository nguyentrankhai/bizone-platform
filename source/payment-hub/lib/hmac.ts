import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Merchant API request signature (OpenAPI `MerchantHMAC`):
 *
 *   X-Signature = hex( HMAC-SHA256( secret,
 *       HTTP_METHOD + "\n" + URI_PATH + "\n" + X-Timestamp + "\n" + hex(SHA256(body)) ) )
 *
 * - HTTP_METHOD: upper case (`POST`)
 * - URI_PATH: path plus query string exactly as sent (`/api/v1/transactions?page=2`)
 * - X-Timestamp: Unix seconds, accepted within ±300 s
 * - body: raw request body (empty string when there is none)
 *
 * Binding method + path means a captured signature cannot be replayed against another endpoint.
 */

export const SIGNATURE_MAX_SKEW_SECONDS = 300;

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function buildSigningString(
  method: string,
  uriPath: string,
  timestamp: string,
  rawBody: string,
): string {
  return `${method.toUpperCase()}\n${uriPath}\n${timestamp}\n${sha256Hex(rawBody)}`;
}

export function signRequest(
  secret: string,
  method: string,
  uriPath: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(buildSigningString(method, uriPath, timestamp, rawBody), "utf8")
    .digest("hex");
}

/** Constant-time comparison of the expected and received hex signatures. */
export function verifyRequestSignature(
  secret: string,
  method: string,
  uriPath: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signRequest(secret, method, uriPath, timestamp, rawBody), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Timestamp must be integer Unix seconds within the allowed skew. */
export function isTimestampFresh(timestamp: string, nowMs = Date.now()): boolean {
  if (!/^\d{9,11}$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= SIGNATURE_MAX_SKEW_SECONDS;
}
