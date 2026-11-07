import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 86400; // 24 hours (API-Design §4)
/** A claim whose request died mid-way frees itself so the merchant can retry */
const PROCESSING_TTL_SECONDS = 60;
const KEY_PREFIX = "idempotency:payhub:";
export const IDEMPOTENCY_KEY_MAX = 255;

/**
 * Header name per OpenAPI / API-Design: `Idempotency-Key`. `X-Idempotency-Key` (used before
 * QA-2) is still accepted so existing integrations keep working.
 */
export function idempotencyKeyOf(req: Request): string | undefined {
  const key = req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key");
  return key?.trim() || undefined;
}

interface Entry {
  state: "processing" | "done";
  /** SHA-256 of METHOD + path + body: the same key must not be reused for another request */
  fp: string;
  status?: number;
  response?: unknown;
}

export type IdempotencyClaim =
  | { kind: "claimed" }
  | { kind: "replay"; status: number; response: unknown }
  | { kind: "in_progress" }
  | { kind: "mismatch" };

export function requestFingerprint(method: string, path: string, rawBody: string): string {
  return createHash("sha256").update(`${method}\n${path}\n${rawBody}`).digest("hex");
}

function redisKey(scope: string, merchantId: number, key: string): string {
  return `${KEY_PREFIX}${merchantId}:${scope}:${key}`;
}

/**
 * Atomically claim an idempotency key (Redis SET NX). Exactly one concurrent request gets
 * `claimed`; the others see `in_progress` (→ 409) or, once it finished, `replay`.
 */
export async function claimIdempotency(
  scope: string,
  merchantId: number,
  key: string,
  fp: string,
): Promise<IdempotencyClaim> {
  const redis = getRedis();
  const k = redisKey(scope, merchantId, key);
  const entry: Entry = { state: "processing", fp };
  const set = await redis.set(k, JSON.stringify(entry), "EX", PROCESSING_TTL_SECONDS, "NX");
  if (set === "OK") return { kind: "claimed" };

  const raw = await redis.get(k);
  if (!raw) return claimIdempotency(scope, merchantId, key, fp); // expired in between
  const existing = JSON.parse(raw) as Entry;
  if (existing.fp !== fp) return { kind: "mismatch" };
  if (existing.state === "processing") return { kind: "in_progress" };
  return { kind: "replay", status: existing.status ?? 200, response: existing.response };
}

/** Store the final response for 24 h (only after the side effects are committed) */
export async function completeIdempotency(
  scope: string,
  merchantId: number,
  key: string,
  fp: string,
  status: number,
  response: unknown,
): Promise<void> {
  const entry: Entry = { state: "done", fp, status, response };
  await getRedis().set(redisKey(scope, merchantId, key), JSON.stringify(entry), "EX", TTL_SECONDS);
}

/** Drop a claim when the request failed before creating anything, so a retry can proceed */
export async function releaseIdempotency(
  scope: string,
  merchantId: number,
  key: string,
): Promise<void> {
  await getRedis().del(redisKey(scope, merchantId, key));
}
