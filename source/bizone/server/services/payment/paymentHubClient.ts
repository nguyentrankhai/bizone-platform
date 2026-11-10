import { createHash, createHmac } from "node:crypto";

/**
 * Merchant client for the Payment Hub API (P4.5).
 *
 * Every request is signed like Payment Hub's `lib/hmac.ts` (OpenAPI `MerchantHMAC`):
 *   X-Signature = hex(HMAC-SHA256(secret, METHOD \n PATH?QUERY \n X-Timestamp \n hex(SHA256(body))))
 * with `X-Api-Key` identifying the merchant. Credentials come from env:
 *   PAYHUB_API_URL     base URL incl. `/api` (e.g. http://localhost:4000/api)
 *   PAYHUB_API_KEY     `pk_…` from `npm run apikey:create -- <MERCHANT_CODE>` (Payment Hub)
 *   PAYHUB_API_SECRET  the matching secret (shown once)
 */

export interface PayhubConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

/** Thrown for transport errors and non-2xx answers — `status` 0 means unreachable */
export class PaymentHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PaymentHubError";
  }
}

export interface PayhubQr {
  raw_data: string;
  image_url?: string | null;
  transfer_note?: string | null;
  bank?: { bin?: string; name?: string; account_no?: string; account_name?: string } | null;
  expires_at?: string | null;
}

export interface PayhubCreated {
  transaction_id: number;
  txn_code: string;
  merchant_txn_id: string;
  status: string;
  amount: string;
  payment_method: string | null;
  partner: string | null;
  payment_url: string | null;
  qr_code: PayhubQr | null;
  payment_error?: { code: string; message: string };
  expired_at?: string;
}

export interface PayhubTransaction {
  txnCode: string;
  merchantTxnId: string | null;
  status: string;
  amount: string | number;
  partnerTxnId?: string | null;
  paidAt?: string | null;
}

const PLACEHOLDER = /^(dev-|changeme|your[-_])/i;

/** null when Payment Hub is not configured for this deployment (placeholders count as missing) */
export function payhubConfig(): PayhubConfig | null {
  const baseUrl = process.env.PAYHUB_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.PAYHUB_API_KEY;
  const apiSecret = process.env.PAYHUB_API_SECRET;
  if (!baseUrl || !apiKey || !apiSecret) return null;
  if (PLACEHOLDER.test(apiKey) || PLACEHOLDER.test(apiSecret)) return null;
  return { baseUrl, apiKey, apiSecret };
}

export function signPayhubRequest(
  secret: string,
  method: string,
  pathWithQuery: string,
  timestamp: string,
  body: string,
): string {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return createHmac("sha256", secret)
    .update(`${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${bodyHash}`, "utf8")
    .digest("hex");
}

const TIMEOUT_MS = 10_000;

async function call<T>(
  cfg: PayhubConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = new URL(cfg.baseUrl + path);
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "x-timestamp": ts,
        "x-signature": signPayhubRequest(cfg.apiSecret, method, url.pathname + url.search, ts, raw),
        ...headers,
      },
      body: method === "GET" ? undefined : raw,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new PaymentHubError(
      `Không kết nối được Payment Hub (${e instanceof Error ? e.message : String(e)})`,
      0,
      "UNREACHABLE",
    );
  }
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok || !json?.success) {
    throw new PaymentHubError(
      json?.error?.message ?? `Payment Hub trả HTTP ${res.status}`,
      res.status,
      json?.error?.code ?? "PAYHUB_ERROR",
      json?.error?.details,
    );
  }
  return json.data as T;
}

export interface CreatePayhubTxn {
  merchantTxnId: string;
  amount: number;
  description: string;
  /** Payment Hub route method: `vietqr`, `vnpay_card`, `vnpay_atm`, … */
  paymentMethod: string;
  expiryMinutes?: number;
  qrSize?: 200 | 300 | 500;
  customerName?: string | null;
  customerPhone?: string | null;
  metadata?: Record<string, unknown>;
}

/** POST /v1/transactions — idempotent on merchant_txn_id (also sent as Idempotency-Key) */
export function createPayhubTransaction(
  cfg: PayhubConfig,
  input: CreatePayhubTxn,
): Promise<PayhubCreated> {
  return call<PayhubCreated>(
    cfg,
    "POST",
    "/v1/transactions",
    {
      merchant_txn_id: input.merchantTxnId,
      amount: input.amount,
      currency: "VND",
      description: input.description,
      payment_method: input.paymentMethod,
      expiry_minutes: input.expiryMinutes ?? 15,
      ...(input.qrSize ? { qr_size: input.qrSize } : {}),
      ...(input.customerName ? { customer_name: input.customerName } : {}),
      ...(input.customerPhone ? { customer_phone: input.customerPhone } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
    { "idempotency-key": input.merchantTxnId },
  );
}

/** GET /v1/transactions/merchant/{merchant_txn_id} — status lookup when no webhook arrived */
export function getPayhubTransaction(
  cfg: PayhubConfig,
  merchantTxnId: string,
): Promise<PayhubTransaction> {
  return call<PayhubTransaction>(
    cfg,
    "GET",
    `/v1/transactions/merchant/${encodeURIComponent(merchantTxnId)}`,
  );
}
