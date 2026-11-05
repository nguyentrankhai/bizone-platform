import { z } from "zod";
import type { NextRequest } from "next/server";
import { verifyApiRequest, ApiAuthError } from "@/server/middleware/apiAuth";
import { checkIdempotency, saveIdempotency } from "@/server/middleware/idempotency";
import { requireAdmin } from "@/server/middleware/adminAuth";
import { isTxnStatus } from "@/server/services/stateMachine";
import {
  createTransaction,
  getTransactionById,
  getTransactionByCode,
  getTransactionByMerchantTxnId,
  listTransactions,
  type ListTransactionsInput,
} from "@/server/services/transaction.service";
import {
  PaymentError,
  initiatePayment,
  type InitiatedPayment,
} from "@/server/services/payment.service";
import { isPaymentMethod } from "@/services/routing/routeMap";
import { availableMethods, planRoute } from "@/services/routing/routeEngine";
import { QR_SIZES, type QrSize } from "@/services/qr/vietqr";

// ─── Validators ───────────────────────────────────────────────────────────────

const createTxnSchema = z.object({
  merchant_txn_id: z.string().max(255).optional(),
  amount: z.number().int().positive("Amount must be positive"),
  currency: z.string().length(3).default("VND"),
  description: z.string().max(500).optional(),
  return_url: z.string().url("Invalid return_url").optional(),
  webhook_url: z.string().url("Invalid webhook_url").optional(),
  customer_name: z.string().max(255).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiry_minutes: z.number().int().min(1).max(1440).default(15),
  /**
   * Optional (services/routing/routeMap.ts). Redirect methods → payment_url = PSP URL;
   * `vietqr` → response carries `qr_code`, payment_url = hosted QR page.
   * Omit / null → hosted page where the customer picks among the available methods.
   */
  payment_method: z
    .string()
    .refine((m) => isPaymentMethod(m), "Unsupported payment_method")
    .nullish(),
  qr_size: z
    .number()
    .int()
    .refine((n) => (QR_SIZES as readonly number[]).includes(n), "qr_size must be 200, 300 or 500")
    .optional(),
  customer_ip: z.string().max(45).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function err(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error: { code, message, details } }, { status });
}

function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

async function readBody(req: NextRequest): Promise<string> {
  return req.text();
}

// ─── POST /api/v1/transactions ────────────────────────────────────────────────

export async function handleCreateTransaction(req: NextRequest): Promise<Response> {
  const rawBody = await readBody(req);

  let merchant;
  try {
    merchant = await verifyApiRequest(req, rawBody);
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
    throw e;
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createTxnSchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Validation failed", 400, parsed.error.flatten().fieldErrors);
  }
  const input = parsed.data;

  // Idempotency
  const idempotencyKey = req.headers.get("x-idempotency-key") ?? undefined;
  if (idempotencyKey) {
    const cached = await checkIdempotency(merchant.merchantId, idempotencyKey);
    if (cached) return ok(cached);
  }

  // Fail fast when the Route Engine has no partner for the requested method (before
  // creating the transaction). Other methods keep working — tell the merchant which.
  if (input.payment_method) {
    const plan = await planRoute(merchant.merchantId, input.payment_method);
    if (plan.candidates.length === 0) {
      return err("SERVICE_UNAVAILABLE", "Payment method is not available", 503, {
        payment_method: input.payment_method,
        skipped: plan.skipped.map((x) => ({
          partner_config_id: x.partnerConfigId,
          reason: x.reason,
        })),
        available_methods: await availableMethods(merchant.merchantId),
      });
    }
  }

  const txn = await createTransaction(
    {
      merchantTxnId: input.merchant_txn_id,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      returnUrl: input.return_url,
      webhookUrl: input.webhook_url,
      customerName: input.customer_name,
      customerEmail: input.customer_email,
      customerPhone: input.customer_phone,
      metadata: input.metadata,
      idempotencyKey,
      expiryMinutes: input.expiry_minutes,
      ipAddress: getClientIp(req),
    },
    merchant.merchantId,
    merchant.apiKeyId,
  );

  let paymentUrl = txn.paymentUrl;
  let status: string = txn.status;
  let initiated: InitiatedPayment | undefined;
  let paymentError: { code: string; message: string; details?: unknown } | undefined;
  if (input.payment_method) {
    try {
      initiated = await initiatePayment(
        txn.txnCode,
        input.payment_method,
        input.customer_ip ?? getClientIp(req),
        { qrSize: input.qr_size as QrSize | undefined },
      );
      paymentUrl = initiated.paymentUrl;
      status = "Pending";
    } catch (e) {
      if (!(e instanceof PaymentError)) throw e;
      // Every partner failed between the check above and now. The transaction exists and
      // stays Created: the customer can still pick another method on the hosted page.
      console.error(`[transactions] initiatePayment failed for ${txn.txnCode}: ${e.message}`);
      paymentError = { code: e.code, message: e.message, details: e.details };
    }
  }

  const qr = initiated?.kind === "qr" ? initiated.qr : undefined;
  const response = {
    transaction_id: txn.id,
    txn_code: txn.txnCode,
    merchant_txn_id: txn.merchantTxnId,
    status,
    amount: txn.amount.toString(),
    currency: txn.currency,
    payment_method: input.payment_method ?? null,
    partner: initiated?.connectorType ?? null,
    payment_url: paymentUrl,
    qr_code: qr
      ? {
          qr_id: qr.qr_id,
          type: qr.type,
          size: qr.size,
          image_base64: qr.image_base64,
          image_url: qr.image_url,
          raw_data: qr.raw_data,
          transfer_note: qr.transfer_note,
          bank: qr.bank,
          expires_at: qr.expires_at,
        }
      : null,
    ...(initiated?.fallbackUsed ? { fallback_used: true } : {}),
    ...(paymentError ? { payment_error: paymentError } : {}),
    expired_at: txn.expiredAt?.toISOString(),
    created_at: txn.createdAt.toISOString(),
  };

  if (idempotencyKey) {
    await saveIdempotency(merchant.merchantId, idempotencyKey, response);
  }

  return ok(response, 201);
}

// ─── GET /api/v1/transactions/[id] ────────────────────────────────────────────

export async function handleGetTransaction(req: NextRequest, id: string): Promise<Response> {
  let merchant;
  try {
    merchant = await verifyApiRequest(req, "");
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
    throw e;
  }

  // id can be numeric id OR txn_code
  let txn;
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) {
    txn = await getTransactionById(numId, merchant.merchantId);
  } else {
    txn = await getTransactionByCode(id, merchant.merchantId);
  }

  if (!txn) return err("NOT_FOUND", "Transaction not found", 404);

  return ok(serializeTxnFull(txn));
}

// ─── GET /api/v1/transactions/merchant/[merchant_txn_id] ─────────────────────

export async function handleGetByMerchantTxnId(
  req: NextRequest,
  merchantTxnId: string,
): Promise<Response> {
  let merchant;
  try {
    merchant = await verifyApiRequest(req, "");
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
    throw e;
  }

  const txn = await getTransactionByMerchantTxnId(merchantTxnId, merchant.merchantId);
  if (!txn) return err("NOT_FOUND", "Transaction not found", 404);

  return ok(serializeTxnFull(txn));
}

// ─── GET /api/v1/transactions ─────────────────────────────────────────────────
// Merchant (X-Api-Key + HMAC) → own transactions only.
// Admin (Keycloak JWT via proxy.ts) → role payhub-admin | payhub-viewer, scoped by merchant_id claim.

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export async function handleListTransactions(req: NextRequest): Promise<Response> {
  let merchantId: number | undefined;
  if (req.headers.has("x-api-key")) {
    try {
      merchantId = (await verifyApiRequest(req, "")).merchantId;
    } catch (e) {
      if (e instanceof ApiAuthError) return err(e.code, e.message, e.status);
      throw e;
    }
  } else {
    const auth = requireAdmin(req);
    if (auth instanceof Response) return auth;
    merchantId = auth.merchantId;
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const input: ListTransactionsInput = {
    page: parsePositiveInt(searchParams.get("page"), 1),
    limit: Math.min(parsePositiveInt(searchParams.get("limit"), 20), 100),
    status: status && isTxnStatus(status) ? status : undefined,
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    merchantId,
  };

  const result = await listTransactions(input);
  return ok(result);
}

// ─── Serialize ────────────────────────────────────────────────────────────────

function serializeTxnFull(txn: {
  amount: { toString(): string };
  refundedAmount: { toString(): string };
  logs?: { id: bigint; [k: string]: unknown }[];
  [k: string]: unknown;
}) {
  return {
    ...txn,
    amount: txn.amount.toString(),
    refundedAmount: txn.refundedAmount.toString(),
    logs: txn.logs?.map((l) => ({ ...l, id: l.id.toString() })),
  };
}
