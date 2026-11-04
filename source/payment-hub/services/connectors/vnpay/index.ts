import { randomUUID } from "node:crypto";
import type {
  ConfigSchemaField,
  ConnectorConfig,
  CreatePaymentResult,
  HealthResult,
  PaymentConnector,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
  StatusQuery,
  StatusResult,
} from "../types";
import {
  VNPAY_RESPONSE_MESSAGES,
  VNPAY_VERSION,
  bankCodeFor,
  buildSignData,
  formatVnpDate,
  normalizeIp,
  parseVnpDate,
  safeEqualHex,
  sanitizeOrderInfo,
  signParams,
  signPipe,
  verifyParams,
} from "./vnpay.util";

export const VNPAY_SANDBOX_PAY_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
export const VNPAY_SANDBOX_API_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

/** Fields signed in the merchant_webapi responses (order matters). */
const REFUND_RESPONSE_FIELDS = [
  "vnp_ResponseId",
  "vnp_Command",
  "vnp_ResponseCode",
  "vnp_Message",
  "vnp_TmnCode",
  "vnp_TxnRef",
  "vnp_Amount",
  "vnp_BankCode",
  "vnp_PayDate",
  "vnp_TransactionNo",
  "vnp_TransactionType",
  "vnp_TransactionStatus",
  "vnp_OrderInfo",
] as const;
const QUERY_RESPONSE_FIELDS = [
  ...REFUND_RESPONSE_FIELDS,
  "vnp_PromotionCode",
  "vnp_PromotionAmount",
] as const;

export class VnpayConnector implements PaymentConnector {
  readonly code = "vnpay";
  readonly version = "1.0.0";

  constructor(private readonly config: ConnectorConfig) {}

  // ─── Create payment URL ────────────────────────────────────────────────────

  async createTransaction(req: PaymentRequest): Promise<CreatePaymentResult> {
    const params: Record<string, string> = {
      vnp_Version: VNPAY_VERSION,
      vnp_Command: "pay",
      vnp_TmnCode: this.config.merchantCode,
      vnp_Locale: req.locale ?? "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: req.txnCode,
      vnp_OrderInfo: sanitizeOrderInfo(req.description),
      vnp_OrderType: "other",
      vnp_Amount: String(Math.round(req.amount) * 100),
      vnp_ReturnUrl: req.returnUrl,
      vnp_IpAddr: normalizeIp(req.ipAddress),
      vnp_CreateDate: formatVnpDate(req.createdAt),
    };
    if (req.expiredAt) params.vnp_ExpireDate = formatVnpDate(req.expiredAt);
    const bankCode = bankCodeFor(req.paymentMethod);
    if (bankCode) params.vnp_BankCode = bankCode;

    const query = buildSignData(params);
    const secureHash = signParams(params, this.config.secretKey);
    const paymentUrl = `${this.config.endpoint}?${query}&vnp_SecureHash=${secureHash}`;
    return { paymentUrl, partnerRequest: params };
  }

  // ─── Redirect / IPN result ─────────────────────────────────────────────────

  verifySignature(payload: Record<string, string>, signature: string): boolean {
    return verifyParams({ ...payload, vnp_SecureHash: signature }, this.config.secretKey);
  }

  /** Map VNPay redirect/IPN params → Core PaymentResult. Caller must verify the signature first. */
  processResult(raw: Record<string, string>): PaymentResult {
    const responseCode = raw.vnp_ResponseCode ?? "";
    const txnStatus = raw.vnp_TransactionStatus ?? responseCode;
    const success = responseCode === "00" && txnStatus === "00";
    return {
      txnCode: raw.vnp_TxnRef ?? "",
      outcome: success ? "Success" : "Failed",
      partnerTxnId:
        raw.vnp_TransactionNo && raw.vnp_TransactionNo !== "0" ? raw.vnp_TransactionNo : undefined,
      amount: Number(raw.vnp_Amount ?? 0) / 100,
      paidAt: success ? parseVnpDate(raw.vnp_PayDate) : undefined,
      errorCode: success ? undefined : responseCode,
      errorMessage: success
        ? undefined
        : (VNPAY_RESPONSE_MESSAGES[responseCode] ?? `VNPay response code ${responseCode}`),
      bankCode: raw.vnp_BankCode,
      partnerRaw: raw,
    };
  }

  // ─── Refund (merchant_webapi) ──────────────────────────────────────────────

  async refund(req: RefundRequest): Promise<RefundResult> {
    const body: Record<string, string> = {
      vnp_RequestId: randomUUID().replace(/-/g, "").slice(0, 32),
      vnp_Version: VNPAY_VERSION,
      vnp_Command: "refund",
      vnp_TmnCode: this.config.merchantCode,
      vnp_TransactionType: req.type === "full" ? "02" : "03",
      vnp_TxnRef: req.txnCode,
      vnp_Amount: String(Math.round(req.amount) * 100),
      vnp_TransactionNo: req.partnerTxnId ?? "",
      vnp_TransactionDate: req.transactionDate,
      vnp_CreateBy: req.createdBy,
      vnp_CreateDate: formatVnpDate(new Date()),
      vnp_IpAddr: normalizeIp(req.ipAddress),
      vnp_OrderInfo: sanitizeOrderInfo(`Hoan tien ${req.txnCode} ${req.reason}`),
    };
    body.vnp_SecureHash = signPipe(
      [
        body.vnp_RequestId,
        body.vnp_Version,
        body.vnp_Command,
        body.vnp_TmnCode,
        body.vnp_TransactionType,
        body.vnp_TxnRef,
        body.vnp_Amount,
        body.vnp_TransactionNo,
        body.vnp_TransactionDate,
        body.vnp_CreateBy,
        body.vnp_CreateDate,
        body.vnp_IpAddr,
        body.vnp_OrderInfo,
      ],
      this.config.secretKey,
    );

    const res = await this.callApi(body);
    const data = res as Record<string, string>;
    const responseCode = data.vnp_ResponseCode ?? "";
    const signatureValid = this.verifyApiResponse(data, REFUND_RESPONSE_FIELDS);
    const { vnp_SecureHash: _hash, ...request } = body;
    void _hash;
    return {
      success: responseCode === "00" && signatureValid,
      partnerRefundId: data.vnp_TransactionNo,
      responseCode,
      message: data.vnp_Message ?? "",
      signatureValid,
      partnerRequest: request,
      partnerRaw: data,
    };
  }

  // ─── Query transaction (querydr) ───────────────────────────────────────────

  async getStatus(query: StatusQuery): Promise<StatusResult> {
    const body: Record<string, string> = {
      vnp_RequestId: randomUUID().replace(/-/g, "").slice(0, 32),
      vnp_Version: VNPAY_VERSION,
      vnp_Command: "querydr",
      vnp_TmnCode: this.config.merchantCode,
      vnp_TxnRef: query.txnCode,
      vnp_OrderInfo: sanitizeOrderInfo(`Truy van ${query.txnCode}`),
      vnp_TransactionDate: query.transactionDate,
      vnp_CreateDate: formatVnpDate(new Date()),
      vnp_IpAddr: normalizeIp(query.ipAddress),
    };
    body.vnp_SecureHash = signPipe(
      [
        body.vnp_RequestId,
        body.vnp_Version,
        body.vnp_Command,
        body.vnp_TmnCode,
        body.vnp_TxnRef,
        body.vnp_TransactionDate,
        body.vnp_CreateDate,
        body.vnp_IpAddr,
        body.vnp_OrderInfo,
      ],
      this.config.secretKey,
    );

    const data = (await this.callApi(body)) as Record<string, string>;
    const responseCode = data.vnp_ResponseCode ?? "";
    const transactionStatus = data.vnp_TransactionStatus;
    const signatureValid = this.verifyApiResponse(data, QUERY_RESPONSE_FIELDS);
    let outcome: StatusResult["outcome"] = "Unknown";
    if (responseCode === "00" && signatureValid) {
      outcome =
        transactionStatus === "00" ? "Success" : transactionStatus === "01" ? "Pending" : "Failed";
    }
    return {
      outcome,
      responseCode,
      transactionStatus,
      message: data.vnp_Message ?? "",
      partnerTxnId: data.vnp_TransactionNo,
      signatureValid,
      partnerRaw: data,
    };
  }

  // ─── Metadata / health ─────────────────────────────────────────────────────

  getConfigSchema(): ConfigSchemaField[] {
    return [
      { key: "merchant_code", label: "TMN Code", type: "string", required: true },
      {
        key: "secret_key",
        label: "Hash Secret",
        type: "secret",
        required: true,
        description: "vnp_HashSecret — lưu mã hoá AES-256-GCM",
      },
      {
        key: "endpoint_sandbox",
        label: "Payment URL (Sandbox)",
        type: "url",
        required: true,
        description: VNPAY_SANDBOX_PAY_URL,
      },
      {
        key: "endpoint_production",
        label: "Payment URL (Production)",
        type: "url",
        required: false,
      },
      {
        key: "api_endpoint",
        label: "API URL (querydr/refund)",
        type: "url",
        required: true,
        description: VNPAY_SANDBOX_API_URL,
      },
      { key: "timeout", label: "Timeout (ms)", type: "number", required: false },
    ];
  }

  /**
   * Credential probe: querydr for a transaction that cannot exist. With a valid TMN code and
   * HashSecret VNPay answers with a *signed* response — "91" (transaction not found) or "00".
   * Bad TMN → "02"/"03"/"99"; bad secret → "97" or an unverifiable signature.
   */
  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    try {
      const status = await this.getStatus({
        txnCode: `HEALTHCHECK${Date.now()}`,
        transactionDate: formatVnpDate(new Date()),
        ipAddress: "127.0.0.1",
      });
      const latencyMs = Date.now() - started;
      const healthy = status.signatureValid && ["00", "91"].includes(status.responseCode);
      const detail = status.message ? ` ${status.message}` : "";
      return {
        healthy,
        latencyMs,
        message: healthy
          ? `VNPay ${this.config.environment}: kết nối và chữ ký hợp lệ (mã ${status.responseCode})`
          : `VNPay từ chối: mã ${status.responseCode || "?"}${detail}${
              status.signatureValid ? "" : " — chữ ký phản hồi không hợp lệ"
            }`,
      };
    } catch (e) {
      return {
        healthy: false,
        latencyMs: Date.now() - started,
        message: e instanceof Error ? e.message : "Unreachable",
      };
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async callApi(body: Record<string, string>): Promise<unknown> {
    const url = this.config.apiEndpoint ?? VNPAY_SANDBOX_API_URL;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { vnp_ResponseCode: `HTTP_${res.status}`, vnp_Message: text.slice(0, 500) };
    }
  }

  private verifyApiResponse(data: Record<string, string>, fields: readonly string[]): boolean {
    if (!data.vnp_SecureHash) return false;
    const expected = signPipe(
      fields.map((f) => data[f]),
      this.config.secretKey,
    );
    return safeEqualHex(expected, data.vnp_SecureHash);
  }
}
