import { z } from "zod";
import type { NextRequest } from "next/server";
import { verifyApiRequest, ApiAuthError } from "@/server/middleware/apiAuth";
import { checkIdempotency, saveIdempotency } from "@/server/middleware/idempotency";
import {
  createTransaction,
  getTransactionById,
  getTransactionByCode,
  getTransactionByMerchantTxnId,
  listTransactions,
  type ListTransactionsInput,
} from "@/server/services/transaction.service";

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

  const response = {
    transaction_id: txn.id,
    txn_code: txn.txnCode,
    status: txn.status,
    amount: txn.amount.toString(),
    currency: txn.currency,
    payment_url: txn.paymentUrl,
    expired_at: txn.expiredAt?.toISOString(),
    created_at: txn.createdAt.toISOString(),
  };

  if (idempotencyKey) {
    await saveIdempotency(merchant.merchantId, idempotencyKey, response);
  }

  return ok(response, 201);
}

// ─── GET /api/v1/transactions/[id] ────────────────────────────────────────────

export async function handleGetTransaction(
  req: NextRequest,
  id: string,
): Promise<Response> {
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

// ─── GET /api/v1/transactions (admin/internal — Keycloak JWT) ─────────────────

export async function handleListTransactions(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);

  const input: ListTransactionsInput = {
    page: parseInt(searchParams.get("page") ?? "1", 10),
    limit: Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100),
    status: (searchParams.get("status") as ListTransactionsInput["status"]) || undefined,
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
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
