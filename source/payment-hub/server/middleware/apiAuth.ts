import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { NextRequest } from "next/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import { isTimestampFresh, verifyRequestSignature } from "@/lib/hmac";
import { clientIp } from "@/lib/client-ip";
import { createHash } from "node:crypto";
import { bruteForceState, clearFailures, registerFailure } from "@/lib/rate-limit";

const RATE_WINDOW_SECONDS = 60;
const LAST_USED_RESOLUTION_S = 60;

export interface MerchantContext {
  merchantId: number;
  merchantCode: string;
  apiKeyId: number;
  rateLimit: number;
}

/** Errors returned as plain objects for the route to format into JSON */
export class ApiAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 401,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/**
 * Verify API Key + HMAC-SHA256 signature.
 *
 * Request must include:
 *   X-Api-Key: <api_key>
 *   X-Timestamp: <unix seconds>
 *   X-Signature: hex(HMAC-SHA256(secret, METHOD\nURI_PATH\nTIMESTAMP\nhex(SHA256(body))))
 *
 * See lib/hmac.ts. Timestamp must be within ±300 s of server time. The API secret is stored
 * AES-256-GCM encrypted (`enc:v1:`) and decrypted only to verify the signature.
 */
export async function verifyApiRequest(
  req: NextRequest,
  rawBody: string,
): Promise<MerchantContext> {
  const apiKey = req.headers.get("x-api-key");
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");

  if (!apiKey || !timestamp || !signature) {
    throw new ApiAuthError(
      "UNAUTHORIZED",
      "Missing authentication headers (X-Api-Key, X-Timestamp, X-Signature)",
    );
  }

  // Timestamp drift check (±5 minutes) — a clock problem, not a guess: not counted below
  if (!isTimestampFresh(timestamp)) {
    throw new ApiAuthError("UNAUTHORIZED", "Timestamp expired or invalid");
  }

  // P6.6 brute force: 5 wrong keys / signatures → locked 15 minutes. Per client IP when it is
  // known (TRUST_PROXY) — catches key enumeration; otherwise per presented key (secret guessing).
  const lockKey = bruteForceKey(req, apiKey);
  const { locked, failures } = await bruteForceState(lockKey);
  if (locked > 0) {
    throw new ApiAuthError(
      "RATE_LIMITED",
      `Too many failed authentication attempts — retry in ${Math.ceil(locked / 60)} minutes`,
      429,
    );
  }
  const fail = async (message: string): Promise<never> => {
    await registerFailure(lockKey);
    throw new ApiAuthError("UNAUTHORIZED", message);
  };

  const prisma = getPrisma();
  const key = await loadApiKey(apiKey);

  if (!key || key.status !== "Active") {
    return fail("Invalid or revoked API key");
  }
  if (key.merchant.status !== "Active") {
    throw new ApiAuthError("FORBIDDEN", "Merchant account is inactive", 403);
  }
  if (key.expiresAt && key.expiresAt < new Date()) {
    throw new ApiAuthError("UNAUTHORIZED", "API key has expired");
  }

  // HMAC-SHA256 verification over method + path(+query) + timestamp + body hash
  if (!isEncrypted(key.apiSecret)) {
    // Plaintext secrets are no longer accepted — re-issue the key (npm run apikey:create).
    console.error(`[apiAuth] API key #${key.id} has an unencrypted secret; rejecting`);
    throw new ApiAuthError("UNAUTHORIZED", "Invalid or revoked API key");
  }
  const uriPath = req.nextUrl.pathname + req.nextUrl.search;
  const sigValid = verifyRequestSignature(
    key.secret,
    req.method,
    uriPath,
    timestamp,
    rawBody,
    signature,
  );
  if (!sigValid) return fail("Invalid signature");
  if (failures > 0) await clearFailures(lockKey);

  // Rate limiting (per API key, 1-minute sliding window)
  await enforceRateLimit(apiKey, key.rateLimit);

  // Update lastUsedAt in background, at most once a minute per key (P7.4: an UPDATE of the same
  // row on every request serialised concurrent calls of one merchant on its row lock)
  void getRedis()
    .set(`payhub:apikey:used:${key.id}`, "1", "EX", LAST_USED_RESOLUTION_S, "NX")
    .then((first) =>
      first === "OK"
        ? prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        : null,
    )
    .catch(() => {});

  return {
    merchantId: key.merchant.id,
    merchantCode: key.merchant.code,
    apiKeyId: key.id,
    rateLimit: key.rateLimit,
  };
}

// ─── API key cache (P7.4) ─────────────────────────────────────────────────────
// Every merchant call looked the key up in the DB and decrypted its secret. Cached per process for
// API_KEY_CACHE_TTL_MS (default 10 s, 0 = off): a revoked / expired key or a deactivated merchant
// is refused at most that long after the change on each instance. Unknown keys are never cached.

type ApiKeyRow = NonNullable<Awaited<ReturnType<typeof findApiKey>>>;
type CachedKey = ApiKeyRow & { secret: string };

const KEY_CACHE_MAX = 5000;
const keyCache = new Map<string, { at: number; value: CachedKey }>();

function keyCacheTtl(): number {
  const n = Number(process.env.API_KEY_CACHE_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 60_000) : 10_000;
}

function findApiKey(apiKey: string) {
  return getPrisma().apiKey.findUnique({
    where: { apiKey },
    include: { merchant: { select: { id: true, code: true, status: true } } },
  });
}

async function loadApiKey(apiKey: string): Promise<CachedKey | null> {
  const ttl = keyCacheTtl();
  const hit = keyCache.get(apiKey);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const row = await findApiKey(apiKey);
  if (!row) return null;
  // Plaintext secrets are rejected below; only encrypted ones are decrypted (and cached)
  const value: CachedKey = {
    ...row,
    secret: isEncrypted(row.apiSecret) ? decryptSecret(row.apiSecret) : "",
  };
  if (ttl > 0) {
    if (keyCache.size >= KEY_CACHE_MAX) keyCache.delete(keyCache.keys().next().value as string);
    keyCache.set(apiKey, { at: Date.now(), value });
  }
  return value;
}

/** Tests / key rotation within one process. */
export function clearApiKeyCache(): void {
  keyCache.clear();
}

function bruteForceKey(req: NextRequest, apiKey: string): string {
  const ip = clientIp(req.headers);
  return ip
    ? `payhub:apikey:ip:${ip}`
    : `payhub:apikey:key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 32)}`;
}

async function enforceRateLimit(apiKey: string, limit: number): Promise<void> {
  // One round trip (P7.4): INCR + EXPIRE NX in a MULTI on the same key (cluster-safe)
  const key = `rate:payhub:${apiKey}`;
  let count = 0;
  try {
    const res = await getRedis().multi().incr(key).expire(key, RATE_WINDOW_SECONDS, "NX").exec();
    count = Number(res?.[0]?.[1] ?? 0);
  } catch (err) {
    // P7.5 graceful degradation: Redis down → serve without the per-key limit (logged) rather
    // than refuse every payment; the HMAC signature + brute-force rules still apply.
    console.error(`[api-auth] rate limit unavailable: ${(err as Error).message}`);
    return;
  }
  if (count > limit) {
    throw new ApiAuthError(
      "RATE_LIMITED",
      `Rate limit exceeded: max ${limit} requests/minute`,
      429,
    );
  }
}
