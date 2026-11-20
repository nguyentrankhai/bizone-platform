/**
 * IConnector — the contract every payment connector implements (SRS-PaymentHub §3.3.2,
 * SRS-PH-PARTNER-02-05), built-in (VNPay, MoMo, ZaloPay — compiled into Payment Hub) or plugin
 * (signed zip uploaded at /connectors, run in a sandboxed child process — P7.1).
 *
 * Core talks to a connector only through the DTOs of ./types.ts. A plugin proxy answers every call
 * asynchronously, so the core always `await`s — `processResult` / `verifySignature` may return a
 * plain value (built-ins) or a promise (plugins).
 *
 * Plugin authors: see documents/Connector-Plugin-Guide.md. A plugin module exports
 * `createConnector(config: ConnectorConfig): IConnector` (+ optional `callbackKeys`, see below).
 */

import type {
  ConfigSchemaField,
  CreatePaymentResult,
  DisputeQueryResult,
  DisputeSubmitRequest,
  DisputeSubmitResult,
  HealthResult,
  PartnerQr,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
  StatusQuery,
  StatusResult,
} from "./types";

export type MaybePromise<T> = T | Promise<T>;

/**
 * Version of the plugin contract (this interface + DTOs + sandbox protocol). A plugin declares the
 * range it was built for (`coreCompatibility`, e.g. "^1.0.0"); an upload outside it is refused.
 * MAJOR changes when a DTO / method changes incompatibly.
 */
export const CONNECTOR_API_VERSION = "1.0.0";

/** QR for a transaction rendered by the PSP's own standard (optional — SRS §3.3.2 generateQR). */
export interface QrRequest {
  txnCode: string;
  amount: number;
  description: string;
  expiredAt?: Date;
}

export interface IConnector {
  readonly code: string;
  readonly version: string;
  /** Build the PSP payment (URL, optionally a wallet QR) for a transaction. */
  createTransaction(req: PaymentRequest): Promise<CreatePaymentResult>;
  /** Map a PSP result (IPN / callback / redirect / status query fields) to the core PaymentResult. */
  processResult(raw: Record<string, string>): MaybePromise<PaymentResult>;
  /** Verify the PSP signature of a callback / redirect payload. */
  verifySignature(payload: Record<string, string>, signature: string): MaybePromise<boolean>;
  refund(req: RefundRequest): Promise<RefundResult>;
  /**
   * Status of an earlier refund by its merchant-side reference (`RefundResult.partnerRefundRef`) —
   * only PSPs that refund asynchronously (ZaloPay query_refund). Used by the refund poller (P5.3).
   */
  queryRefund?(partnerRefundRef: string): Promise<RefundResult>;
  getStatus(query: StatusQuery): Promise<StatusResult>;
  /** Optional: QR in the PSP's own format (none of the built-ins needs it — VietQR is core). */
  generateQR?(data: QrRequest): Promise<PartnerQr>;
  /**
   * Dispute API (P5.6) — optional: none of VNPay / MoMo / ZaloPay / VietQR publishes one (disputes
   * go through their merchant portals / support e-mail). A connector that implements submitDispute
   * makes the Hub send disputes automatically; queryDispute lets an operator ask for the result.
   */
  submitDispute?(req: DisputeSubmitRequest): Promise<DisputeSubmitResult>;
  queryDispute?(partnerRef: string): Promise<DisputeQueryResult>;
  getConfigSchema(): ConfigSchemaField[];
  healthCheck(): Promise<HealthResult>;
}

/** @deprecated name used before P7.1 — same contract. */
export type PaymentConnector = IConnector;

/**
 * Static helper a plugin exports for its callback / return URL: which transaction the payload is
 * about and where its signature is — read before the core knows which partner config (secrets) to
 * build the connector with. `null` = not a payload of this PSP.
 */
export type CallbackKeysFn = (
  raw: Record<string, string>,
) => MaybePromise<{ txnCode: string; signature: string } | null>;
