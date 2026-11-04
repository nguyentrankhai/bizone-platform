import { z } from "zod";
import type { NextRequest } from "next/server";
import { verifyApiRequest, ApiAuthError, type MerchantContext } from "@/server/middleware/apiAuth";
import { rateLimit } from "@/lib/rate-limit";
import {
  QR_MAX_EXPIRES_SECONDS,
  QR_MIN_EXPIRES_SECONDS,
  QR_TYPES,
  QrError,
  generateQr,
  getQrImage,
  type GenerateQrResult,
} from "@/server/services/qr.service";
import { QR_SIZES, type QrSize } from "@/services/qr/vietqr";

/**
 * Merchant QR API (API key + HMAC):
 *   POST /api/v1/qr/generate        — create (or return the active) QR for a transaction
 *   GET  /api/v1/qr/{transaction}   — current QR; refreshed automatically when expired
 * Public:
 *   GET  /qr/{token}.png            — QR image, only while the QR is valid
 */

const QR_RATE_LIMIT = 60; // req/min per API key (API-Design-PaymentHub: rate limit "QR Generate")

const FORMATS = ["all", "base64", "url", "raw"] as const;
type Format = (typeof FORMATS)[number];

const sizeSchema = z.coerce
  .number()
  .int()
  .refine((n): n is QrSize => (QR_SIZES as readonly number[]).includes(n), {
    message: `size must be one of ${QR_SIZES.join(", ")}`,
  });

const generateSchema = z.object({
  transaction_id: z.union([z.string().min(1).max(100), z.number().int().positive()]),
  type: z.enum(QR_TYPES).default("VietQR"),
  size: sizeSchema.default(300),
  format: z.enum(FORMATS).default("all"),
  expires_in_seconds: z
    .number()
    .int()
    .min(QR_MIN_EXPIRES_SECONDS)
    .max(QR_MAX_EXPIRES_SECONDS)
    .optional(),
});

const getQuerySchema = z.object({
  type: z.enum(QR_TYPES).default("VietQR"),
  size: sizeSchema.default(300),
  format: z.enum(FORMATS).default("all"),
});

function ok(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

const QR_ERROR_STATUS: Record<QrError["code"], number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  SERVICE_UNAVAILABLE: 503,
};

async function authenticate(req: NextRequest, rawBody: string): Promise<MerchantContext> {
  const merchant = await verifyApiRequest(req, rawBody);
  const rl = await rateLimit(`rl:payhub:qr:${merchant.apiKeyId}`, QR_RATE_LIMIT, 60);
  if (!rl.allowed) {
    throw new ApiAuthError(
      "RATE_LIMITED",
      `QR rate limit exceeded: max ${QR_RATE_LIMIT} requests/minute`,
      429,
    );
  }
  return merchant;
}

function present(result: GenerateQrResult, format: Format) {
  const { qr } = result;
  return {
    qr_id: qr.qr_id,
    transaction_id: qr.transaction_id,
    transaction_status: result.transactionStatus,
    type: qr.type,
    size: qr.size,
    format,
    raw_data: qr.raw_data,
    ...(format === "all" || format === "base64" ? { image_base64: qr.image_base64 } : {}),
    ...(format === "all" || format === "url" ? { image_url: qr.image_url } : {}),
    amount: qr.amount,
    currency: "VND",
    transfer_note: qr.transfer_note,
    bank: qr.bank,
    expires_at: qr.expires_at,
    created_at: qr.created_at,
    reused: result.reused,
    refreshed: result.refreshed,
  };
}

async function run(
  req: NextRequest,
  rawBody: string,
  produce: (merchant: MerchantContext) => Promise<Response>,
): Promise<Response> {
  let merchant;
  try {
    merchant = await authenticate(req, rawBody);
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
    throw e;
  }
  try {
    return await produce(merchant);
  } catch (e) {
    if (e instanceof QrError) return err(e.code, e.message, QR_ERROR_STATUS[e.code]);
    throw e;
  }
}

// ─── POST /api/v1/qr/generate ─────────────────────────────────────────────────

export async function handleGenerateQr(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  return run(req, rawBody, async (merchant) => {
    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return err("VALIDATION_ERROR", "Invalid JSON body", 400);
    }
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", "Validation failed", 400, parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;
    const started = performance.now();
    const result = await generateQr(merchant.merchantId, String(input.transaction_id), {
      type: input.type,
      size: input.size as QrSize,
      expiresInSeconds: input.expires_in_seconds,
    });
    const elapsed = Math.round(performance.now() - started);
    const res = ok(present(result, input.format), result.reused ? 200 : 201);
    res.headers.set("Server-Timing", `qr;dur=${elapsed}`);
    return res;
  });
}

// ─── GET /api/v1/qr/[transaction_id] ──────────────────────────────────────────

export async function handleGetQr(req: NextRequest, transactionRef: string): Promise<Response> {
  return run(req, "", async (merchant) => {
    const parsed = getQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return err("VALIDATION_ERROR", "Validation failed", 400, parsed.error.flatten().fieldErrors);
    }
    const result = await generateQr(merchant.merchantId, transactionRef, {
      type: parsed.data.type,
      size: parsed.data.size as QrSize,
    });
    return ok(present(result, parsed.data.format));
  });
}

// ─── GET /qr/[token].png (public) ─────────────────────────────────────────────

export async function handleQrImage(file: string): Promise<Response> {
  const match = /^([0-9a-f]{32})\.png$/.exec(file);
  const png = match ? await getQrImage(match[1]) : null;
  if (!png) {
    return err("NOT_FOUND", "QR code not found or expired", 404);
  }
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      // The token is single-use per QR and the image never changes — but it must stop being
      // served at expiry, so keep shared caches out.
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
