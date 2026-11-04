import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { NextRequest } from "next/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import { isTimestampFresh, verifyRequestSignature } from "@/lib/hmac";

const RATE_WINDOW_SECONDS = 60;

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

  // Timestamp drift check (±5 minutes)
  if (!isTimestampFresh(timestamp)) {
    throw new ApiAuthError("UNAUTHORIZED", "Timestamp expired or invalid");
  }

  const prisma = getPrisma();
  const key = await prisma.apiKey.findUnique({
    where: { apiKey },
    include: { merchant: { select: { id: true, code: true, status: true } } },
  });

  if (!key || key.status !== "Active") {
    throw new ApiAuthError("UNAUTHORIZED", "Invalid or revoked API key");
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
    decryptSecret(key.apiSecret),
    req.method,
    uriPath,
    timestamp,
    rawBody,
    signature,
  );
  if (!sigValid) {
    throw new ApiAuthError("UNAUTHORIZED", "Invalid signature");
  }

  // Rate limiting (per API key, 1-minute sliding window)
  await enforceRateLimit(apiKey, key.rateLimit);

  // Update lastUsedAt in background (fire-and-forget)
  void prisma.apiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    merchantId: key.merchant.id,
    merchantCode: key.merchant.code,
    apiKeyId: key.id,
    rateLimit: key.rateLimit,
  };
}

async function enforceRateLimit(apiKey: string, limit: number): Promise<void> {
  const redis = getRedis();
  const key = `rate:payhub:${apiKey}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SECONDS);
  }
  if (count > limit) {
    throw new ApiAuthError(
      "RATE_LIMITED",
      `Rate limit exceeded: max ${limit} requests/minute`,
      429,
    );
  }
}
