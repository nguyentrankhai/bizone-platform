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
}

export interface CreatePaymentResult {
  paymentUrl: string;
  /** Request data the connector sent/encoded — stored as raw data (no secrets). */
  partnerRequest: Record<string, string>;
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
  partnerRefundId?: string;
  responseCode: string;
  message: string;
  signatureValid: boolean;
  partnerRequest: Record<string, string>;
  partnerRaw: unknown;
}

export interface StatusQuery {
  txnCode: string;
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
