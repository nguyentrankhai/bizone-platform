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
  CREATE_SIGNED_FIELDS,
  MOMO_MAX_AMOUNT,
  MOMO_MIN_AMOUNT,
  MOMO_SANDBOX_CREATE_URL,
  QUERY_SIGNED_FIELDS,
  REFUND_SIGNED_FIELDS,
  RESULT_SIGNED_FIELDS,
  classifyResultCode,
  momoOrderId,
  orderExpireMinutes,
  parseEpochMs,
  resultMessage,
  sanitizeOrderInfo,
  signFields,
  txnCodeFromOrderId,
  verifyFields,
} from "./momo.util";

export { MOMO_PRODUCTION_CREATE_URL, MOMO_SANDBOX_CREATE_URL } from "./momo.util";

/** payment_method → MoMo requestType (routeMap: momo_qr). */
const REQUEST_TYPES: Record<string, string> = {
  momo_qr: "captureWallet", // QR on desktop, MoMo app on mobile
};

/** Input the PSP refuses for this transaction — not a partner outage (no fallback / circuit). */
export class MomoValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "MomoValidationError";
  }
}

class MomoDuplicateOrderError extends Error {}

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

/** API base (…/v2/gateway/api) from the configured create URL (…/v2/gateway/api/create). */
export function momoApiBase(createUrl: string): string {
  return createUrl.replace(/\/create\/?$/, "");
}

export class MomoConnector implements PaymentConnector {
  readonly code = "momo";
  readonly version = "1.0.0";

  constructor(private readonly config: ConnectorConfig) {}

  private get partnerCode(): string {
    return this.config.merchantCode;
  }
  private get accessKey(): string {
    return this.config.apiKey;
  }
  private get secretKey(): string {
    return this.config.secretKey;
  }
  private apiUrl(path: "query" | "refund"): string {
    return `${this.config.apiEndpoint ?? momoApiBase(this.config.endpoint)}/${path}`;
  }

  // ─── Create payment (captureWallet) ────────────────────────────────────────

  async createTransaction(req: PaymentRequest): Promise<CreatePaymentResult> {
    const requestType = REQUEST_TYPES[req.paymentMethod];
    if (!requestType) throw new MomoValidationError(`MoMo không hỗ trợ ${req.paymentMethod}`);
    if (req.currency !== "VND") throw new MomoValidationError("MoMo chỉ nhận VND");
    const amount = Math.round(req.amount);
    if (amount < MOMO_MIN_AMOUNT || amount > MOMO_MAX_AMOUNT) {
      throw new MomoValidationError(
        `Số tiền MoMo phải từ ${MOMO_MIN_AMOUNT.toLocaleString("vi-VN")} đến ${MOMO_MAX_AMOUNT.toLocaleString("vi-VN")} ₫`,
      );
    }
    if (!this.config.ipnUrl) throw new Error("MoMo ipnUrl is not configured");

    try {
      return await this.create(req, requestType, amount, momoOrderId(req.txnCode, req.attempt));
    } catch (e) {
      // 41 = orderId already used at MoMo (an earlier request reached MoMo but was never
      // recorded here, e.g. a timeout) → retry once with a fresh numeric suffix.
      if (!(e instanceof MomoDuplicateOrderError)) throw e;
      const suffix = 1000 + (Date.now() % 9_000_000);
      return this.create(req, requestType, amount, momoOrderId(req.txnCode, suffix));
    }
  }

  private async create(
    req: PaymentRequest,
    requestType: string,
    amount: number,
    orderId: string,
  ): Promise<CreatePaymentResult> {
    const ipnUrl = this.config.ipnUrl!;
    const expireMinutes = orderExpireMinutes(req.expiredAt);
    const params: Record<string, string> = {
      partnerCode: this.partnerCode,
      requestId: randomUUID(),
      amount: String(amount),
      orderId,
      orderInfo: sanitizeOrderInfo(req.description),
      redirectUrl: req.returnUrl,
      ipnUrl,
      requestType,
      extraData: "",
      lang: req.locale === "en" ? "en" : "vi",
      ...(expireMinutes ? { orderExpireTime: String(expireMinutes) } : {}),
    };
    const signature = signFields(CREATE_SIGNED_FIELDS, params, this.accessKey, this.secretKey);

    const body: Json = {
      ...params,
      amount,
      ...(expireMinutes ? { orderExpireTime: expireMinutes } : {}),
      autoCapture: true,
      signature,
    };
    const res = await this.post(this.config.endpoint, body);
    if (!res.ok) throw new Error(`MoMo create: HTTP ${res.status}`);
    const data = res.data;
    const code = Number(data.resultCode);
    if (code !== 0) {
      const msg = `MoMo create: ${code} ${resultMessage(code, str(data.message))}`;
      if (code === 21 || code === 22) throw new MomoValidationError(msg);
      if (code === 41) throw new MomoDuplicateOrderError(msg);
      throw new Error(msg);
    }
    if (str(data.orderId) !== orderId || str(data.requestId) !== params.requestId) {
      throw new Error("MoMo create: response does not match the request");
    }
    const payUrl = str(data.payUrl);
    if (!/^https?:\/\//.test(payUrl)) throw new Error("MoMo create: missing payUrl");

    const qrContent = str(data.qrCodeUrl);
    return {
      paymentUrl: payUrl,
      partnerRequest: params,
      partnerResponse: data,
      partnerQr: qrContent
        ? {
            content: qrContent,
            deeplink: str(data.deeplink) || undefined,
            expiresAt: req.expiredAt,
          }
        : undefined,
    };
  }

  // ─── IPN / redirect result ─────────────────────────────────────────────────

  /** IPN body and redirect query string carry the same signed fields. */
  verifySignature(payload: Record<string, string>, signature: string): boolean {
    if (payload.partnerCode !== this.partnerCode) return false;
    return verifyFields(RESULT_SIGNED_FIELDS, payload, signature, this.accessKey, this.secretKey);
  }

  /**
   * Map an IPN / redirect / query payload → Core PaymentResult. Caller must verify the
   * signature (IPN, redirect) or the API echo (query) first.
   */
  processResult(raw: Record<string, string>): PaymentResult {
    const code = Number(raw.resultCode);
    const kind = Number.isFinite(code) ? classifyResultCode(code) : "unknown";
    const success = kind === "success";
    const transId = raw.transId && raw.transId !== "0" ? raw.transId : undefined;
    return {
      txnCode: txnCodeFromOrderId(raw.orderId ?? ""),
      outcome: success ? "Success" : kind === "failed" ? "Failed" : "Pending",
      partnerTxnId: transId,
      amount: Number(raw.amount ?? 0),
      paidAt: success ? (parseEpochMs(raw.responseTime) ?? new Date()) : undefined,
      errorCode: success ? undefined : str(raw.resultCode),
      errorMessage: success ? undefined : resultMessage(code, raw.message),
      bankCode: raw.payType || undefined,
      partnerRaw: raw,
    };
  }

  // ─── Refund ────────────────────────────────────────────────────────────────

  async refund(req: RefundRequest): Promise<RefundResult> {
    const params: Record<string, string> = {
      partnerCode: this.partnerCode,
      orderId: `${req.txnCode}-RF${Date.now().toString(36).toUpperCase()}`,
      requestId: randomUUID(),
      amount: String(Math.round(req.amount)),
      transId: req.partnerTxnId ?? "",
      lang: "vi",
      description: sanitizeOrderInfo(`Hoan tien ${req.txnCode} ${req.reason}`).slice(0, 255),
    };
    if (!params.transId) {
      return {
        success: false,
        responseCode: "MISSING_TRANS_ID",
        message: "Giao dịch chưa có mã giao dịch MoMo (transId)",
        signatureValid: false,
        partnerRequest: params,
        partnerRaw: null,
      };
    }
    const signature = signFields(REFUND_SIGNED_FIELDS, params, this.accessKey, this.secretKey);
    const res = await this.post(this.apiUrl("refund"), {
      ...params,
      amount: Number(params.amount),
      transId: Number(params.transId),
      signature,
    });
    const data = res.data;
    const code = Number(data.resultCode);
    const echoOk = this.echoMatches(data, params);
    return {
      success: res.ok && code === 0 && echoOk,
      partnerRefundId: data.transId !== undefined ? str(data.transId) : undefined,
      responseCode: res.ok ? str(data.resultCode) : `HTTP_${res.status}`,
      message: res.ok ? resultMessage(code, str(data.message)) : str(data.message),
      signatureValid: echoOk,
      partnerRequest: params,
      partnerRaw: data,
    };
  }

  // ─── Query (transaction status) ────────────────────────────────────────────

  /**
   * MoMo's query response is not signed; trust comes from the HTTPS channel to the configured
   * endpoint + the response echoing our partnerCode / orderId / requestId (`signatureValid`).
   */
  async getStatus(query: StatusQuery): Promise<StatusResult> {
    const params: Record<string, string> = {
      partnerCode: this.partnerCode,
      requestId: randomUUID(),
      orderId: query.partnerOrderId ?? query.txnCode,
      lang: "vi",
    };
    const signature = signFields(QUERY_SIGNED_FIELDS, params, this.accessKey, this.secretKey);
    const res = await this.post(this.apiUrl("query"), { ...params, signature });
    const data = res.data;
    if (!res.ok) {
      return {
        outcome: "Unknown",
        responseCode: `HTTP_${res.status}`,
        message: str(data.message),
        signatureValid: false,
        partnerRaw: data,
      };
    }
    const code = Number(data.resultCode);
    const echoOk = this.echoMatches(data, params);
    const kind = echoOk && Number.isFinite(code) ? classifyResultCode(code) : "unknown";
    return {
      outcome:
        kind === "success"
          ? "Success"
          : kind === "failed"
            ? "Failed"
            : kind === "pending"
              ? "Pending"
              : "Unknown",
      responseCode: str(data.resultCode),
      transactionStatus: str(data.resultCode),
      message: resultMessage(code, str(data.message)),
      partnerTxnId: data.transId && str(data.transId) !== "0" ? str(data.transId) : undefined,
      signatureValid: echoOk,
      partnerRaw: data,
    };
  }

  // ─── Metadata / health ─────────────────────────────────────────────────────

  getConfigSchema(): ConfigSchemaField[] {
    return [
      { key: "merchant_code", label: "Partner Code", type: "string", required: true },
      { key: "api_key", label: "Access Key", type: "secret", required: true },
      {
        key: "secret_key",
        label: "Secret Key",
        type: "secret",
        required: true,
        description: "Ký HMAC-SHA256 — lưu mã hoá AES-256-GCM",
      },
      {
        key: "endpoint_sandbox",
        label: "Create URL (Sandbox)",
        type: "url",
        required: true,
        description: MOMO_SANDBOX_CREATE_URL,
      },
      {
        key: "endpoint_production",
        label: "Create URL (Production)",
        type: "url",
        required: false,
      },
      {
        key: "webhook_url",
        label: "IPN URL",
        type: "url",
        required: false,
        description: "Mặc định {APP_URL}/api/ipn/momo — phải truy cập được từ Internet",
      },
      { key: "timeout", label: "Timeout (ms)", type: "number", required: false },
    ];
  }

  /**
   * Credential probe: query an order that cannot exist. Valid partnerCode + accessKey + secret →
   * MoMo answers resultCode 42 (order not found); a wrong key/signature → 11/13.
   */
  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    try {
      const status = await this.getStatus({
        txnCode: `HEALTHCHECK${Date.now()}`,
        transactionDate: "",
        ipAddress: "127.0.0.1",
      });
      const latencyMs = Date.now() - started;
      const code = Number(status.responseCode);
      const healthy =
        status.signatureValid &&
        Number.isFinite(code) &&
        (code === 42 || classifyResultCode(code) !== "unknown");
      return {
        healthy,
        latencyMs,
        message: healthy
          ? `MoMo ${this.config.environment}: kết nối và chữ ký hợp lệ (mã ${status.responseCode})`
          : `MoMo từ chối: mã ${status.responseCode || "?"} ${status.message}`.trim(),
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

  private echoMatches(data: Json, sent: Record<string, string>): boolean {
    return (
      str(data.partnerCode) === sent.partnerCode &&
      str(data.orderId) === sent.orderId &&
      str(data.requestId) === sent.requestId
    );
  }

  private async post(
    url: string,
    body: Json,
  ): Promise<{ ok: boolean; status: number; data: Json }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text) as Json;
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: res.status, data: { message: text.slice(0, 300) } };
    }
  }
}

/** Fields of an IPN / redirect payload, stringified as MoMo signs them. */
export function momoResultPayload(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

export { RESULT_SIGNED_FIELDS };
