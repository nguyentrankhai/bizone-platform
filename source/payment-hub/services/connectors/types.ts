/**
 * Payment Connector interface contract (SRS-PaymentHub §3.3.2).
 *
 * Core Payment Hub talks to every PSP through these DTOs; each connector maps
 * Core DTO ⇄ PSP format. Connectors must never log secrets.
 */

export type PartnerEnvironment = "Sandbox" | "Production";

/** Decrypted partner configuration handed to a connector instance. */
export interface ConnectorConfig {
  partnerConfigId: number;
  connectorType: string;
  merchantCode: string; // e.g. VNPay vnp_TmnCode
  apiKey: string; // decrypted
  secretKey: string; // decrypted (e.g. VNPay HashSecret)
  endpoint: string; // payment endpoint for the active environment
  apiEndpoint?: string; // query/refund API endpoint
  /** Server-to-server notification URL sent with each request (MoMo ipnUrl). */
  ipnUrl?: string;
  environment: PartnerEnvironment;
  timeoutMs: number;
}

/** Core DTO — PaymentRequest */
export interface PaymentRequest {
  txnCode: string;
  amount: number; // VND, integer
  currency: string;
  description: string;
  paymentMethod: string; // vnpay | vnpay_qr | vnpay_atm | vnpay_card …
  returnUrl: string; // Payment Hub redirect handler (not the merchant's URL)
  ipAddress: string;
  locale?: "vn" | "en";
  createdAt: Date;
  expiredAt?: Date;
  /** 1 for the first payment URL of a transaction, 2+ when regenerated (unique PSP order ids). */
  attempt?: number;
}

/** QR / app deeplink returned by wallet PSPs (MoMo, ZaloPay) alongside the payment URL. */
export interface PartnerQr {
  /** String to encode in the QR (scanned by the wallet app) */
  content: string;
  deeplink?: string;
  expiresAt?: Date;
}

export interface CreatePaymentResult {
  paymentUrl: string;
  /** Request data the connector sent/encoded — stored as raw data (no secrets). */
  partnerRequest: Record<string, string>;
  /** PSP response body (no secrets) — stored as raw data when present. */
  partnerResponse?: Record<string, unknown>;
  partnerQr?: PartnerQr;
}

export type PaymentOutcome = "Success" | "Failed" | "Pending";

/** Core DTO — PaymentResult */
export interface PaymentResult {
  txnCode: string;
  outcome: PaymentOutcome;
  partnerTxnId?: string;
  amount: number;
  paidAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  bankCode?: string;
  partnerRaw: Record<string, string>;
}

export interface RefundRequest {
  txnCode: string;
  amount: number;
  /** Full or partial refund */
  type: "full" | "partial";
  partnerTxnId?: string;
  /** Date the original payment request was created at the PSP (VNPay vnp_CreateDate). */
  transactionDate: string;
  reason: string;
  createdBy: string;
  ipAddress: string;
}

export interface RefundResult {
  success: boolean;
  /** Accepted by the PSP but not final yet (ZaloPay return_code 3) — query again later. */
  pending?: boolean;
  partnerRefundId?: string;
  /** Merchant-side refund reference sent to the PSP (ZaloPay m_refund_id) — for status queries. */
  partnerRefundRef?: string;
  responseCode: string;
  message: string;
  signatureValid: boolean;
  partnerRequest: Record<string, string>;
  partnerRaw: unknown;
}

export interface StatusQuery {
  txnCode: string;
  /** Order id the PSP knows the payment by, when it differs from txnCode (MoMo orderId, ZaloPay app_trans_id). */
  partnerOrderId?: string;
  transactionDate: string;
  ipAddress: string;
}

export interface StatusResult {
  outcome: PaymentOutcome | "Unknown";
  responseCode: string;
  transactionStatus?: string;
  message: string;
  partnerTxnId?: string;
  signatureValid: boolean;
  partnerRaw: unknown;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  message: string;
}

export interface ConfigSchemaField {
  key: string;
  label: string;
  type: "string" | "secret" | "url" | "number";
  required: boolean;
  description?: string;
}

export interface PaymentConnector {
  readonly code: string;
  readonly version: string;
  createTransaction(req: PaymentRequest): Promise<CreatePaymentResult>;
  processResult(raw: Record<string, string>): PaymentResult;
  verifySignature(payload: Record<string, string>, signature: string): boolean;
  refund(req: RefundRequest): Promise<RefundResult>;
  getStatus(query: StatusQuery): Promise<StatusResult>;
  getConfigSchema(): ConfigSchemaField[];
  healthCheck(): Promise<HealthResult>;
}
