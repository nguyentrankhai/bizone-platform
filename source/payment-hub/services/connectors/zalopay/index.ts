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
  API_ERROR_SUB_CODES,
  ZALOPAY_MIN_EXPIRE_S,
  ZALOPAY_SANDBOX_CREATE_URL,
  classifyQuery,
  createMac,
  expireDurationSeconds,
  parseEpochMs,
  queryMac,
  queryRefundMac,
  redirectChecksum,
  refundMac,
  safeEqualHex,
  sanitizeDescription,
  subMessage,
  txnCodeFromAppTransId,
  verifyCallbackMac,
  vnYymmdd,
  zalopayAppTransId,
  zalopayRefundId,
} from "./zalopay.util";

export { ZALOPAY_PRODUCTION_CREATE_URL, ZALOPAY_SANDBOX_CREATE_URL } from "./zalopay.util";

/** payment_method → embed_data.preferred_payment_method (routeMap: zalopay_qr). */
const PREFERRED_METHODS: Record<string, string[]> = {
  zalopay_qr: ["zalopay_wallet"], // ZaloPay QR for the ZaloPay / Zalo app
};

/** app_user sent with every order (ZaloPay: user id, or the app name when there is none). */
const APP_USER = "PaymentHub";

/** Input ZaloPay refuses for this transaction — not a partner outage (no fallback / circuit). */
export class ZalopayValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ZalopayValidationError";
  }
}

class ZalopayDuplicateOrderError extends Error {}

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

/** API base (…/v2) from the configured create URL (…/v2/create). */
export function zalopayApiBase(createUrl: string): string {
  return createUrl.replace(/\/create\/?$/, "");
}

/**
 * Callback body `{ data, mac, type }` → the payment fields inside `data` (JSON string), as strings.
 * Returns null when `data` is not a JSON object.
 */
export function parseCallbackData(data: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Json)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return out;
}

export class ZalopayConnector implements PaymentConnector {
  readonly code = "zalopay";
  readonly version = "1.0.0";

  constructor(private readonly config: ConnectorConfig) {}

  private get appId(): string {
    return this.config.merchantCode;
  }
  /** key1 — signs requests to ZaloPay */
  private get key1(): string {
    return this.config.apiKey;
  }
  /** key2 — verifies callbacks / redirects from ZaloPay */
  private get key2(): string {
    return this.config.secretKey;
  }
  private apiUrl(path: "query" | "refund" | "query_refund"): string {
    return `${this.config.apiEndpoint ?? zalopayApiBase(this.config.endpoint)}/${path}`;
  }
  private appIdNumber(): number {
    const n = Number(this.appId);
    if (!Number.isInteger(n) || n <= 0) throw new Error("ZaloPay app_id must be a number");
    return n;
  }

  // ─── Create order ──────────────────────────────────────────────────────────

  async createTransaction(req: PaymentRequest): Promise<CreatePaymentResult> {
    const preferred = PREFERRED_METHODS[req.paymentMethod];
    if (!preferred) throw new ZalopayValidationError(`ZaloPay không hỗ trợ ${req.paymentMethod}`);
    if (req.currency !== "VND") throw new ZalopayValidationError("ZaloPay chỉ nhận VND");
    const amount = Math.round(req.amount);
    if (amount <= 0) throw new ZalopayValidationError("Số tiền ZaloPay phải lớn hơn 0");
    const expire = expireDurationSeconds(req.expiredAt);
    if (expire !== undefined && expire < ZALOPAY_MIN_EXPIRE_S) {
      // ZaloPay keeps an order open ≥ 5 minutes; it must not outlive the transaction (#19).
      throw new ZalopayValidationError(
        "Giao dịch còn dưới 5 phút — không đủ thời gian thanh toán qua ZaloPay",
      );
    }
    if (!this.config.ipnUrl) throw new Error("ZaloPay callback_url is not configured");

    try {
      return await this.create(req, preferred, amount, expire, req.attempt ?? 1);
    } catch (e) {
      // -68 = app_trans_id already used at ZaloPay (an earlier request reached ZaloPay but was
      // never recorded here, e.g. a timeout) → retry once with a fresh numeric suffix.
      if (!(e instanceof ZalopayDuplicateOrderError)) throw e;
      const suffix = 1000 + (Date.now() % 9_000_000);
      return this.create(req, preferred, amount, expire, suffix);
    }
  }

  private async create(
    req: PaymentRequest,
    preferred: string[],
    amount: number,
    expire: number | undefined,
    attempt: number,
  ): Promise<CreatePaymentResult> {
    const appTime = Date.now();
    const params: Record<string, string> = {
      app_id: String(this.appIdNumber()),
      app_user: APP_USER,
      app_trans_id: zalopayAppTransId(req.txnCode, attempt, new Date(appTime)),
      app_time: String(appTime),
      amount: String(amount),
      item: "[]",
      embed_data: JSON.stringify({
        redirecturl: req.returnUrl,
        preferred_payment_method: preferred,
      }),
      description: sanitizeDescription(req.description),
      bank_code: "",
      callback_url: this.config.ipnUrl!,
      ...(expire !== undefined ? { expire_duration_seconds: String(expire) } : {}),
    };
    const mac = createMac(params, this.key1);
    const body: Json = {
      ...params,
      app_id: Number(params.app_id),
      app_time: appTime,
      amount,
      ...(expire !== undefined ? { expire_duration_seconds: expire } : {}),
      mac,
    };

    const res = await this.post(this.config.endpoint, body);
    if (!res.ok) throw new Error(`ZaloPay create: HTTP ${res.status}`);
    const data = res.data;
    const code = Number(data.return_code);
    const sub = Number(data.sub_return_code);
    if (code !== 1) {
      const msg = `ZaloPay create: ${str(data.return_code)}/${str(data.sub_return_code)} ${subMessage(sub, str(data.sub_return_message) || str(data.return_message))}`;
      if (sub === -68) throw new ZalopayDuplicateOrderError(msg);
      // -401 = ZaloPay rejected this order's data (amount, description…) — a business error.
      if (sub === -401) throw new ZalopayValidationError(msg);
      throw new Error(msg);
    }
    const orderUrl = str(data.order_url);
    if (!/^https?:\/\//.test(orderUrl)) throw new Error("ZaloPay create: missing order_url");

    const qrContent = str(data.qr_code);
    return {
      paymentUrl: orderUrl,
      partnerRequest: params,
      partnerResponse: data,
      partnerQr: qrContent
        ? {
            content: qrContent,
            // ZaloPay returns no app deeplink for gateway orders; order_url opens the app on mobile.
            deeplink: undefined,
            expiresAt: req.expiredAt,
          }
        : undefined,
    };
  }

  // ─── Callback / redirect ───────────────────────────────────────────────────

  /**
   * Two payload shapes, both signed with key2:
   *  - callback: `{ data }` (the JSON string as received) + signature = `mac`
   *  - redirect: query string `appid…status` + signature = `checksum`
   * The app_id inside must be this config's.
   */
  verifySignature(payload: Record<string, string>, signature: string): boolean {
    if (payload.data !== undefined && payload.apptransid === undefined) {
      if (!verifyCallbackMac(payload.data, signature, this.key2)) return false;
      const fields = parseCallbackData(payload.data);
      return !!fields && fields.app_id === this.appId;
    }
    if (payload.appid !== this.appId) return false;
    return safeEqualHex(redirectChecksum(payload, this.key2), signature);
  }

  /**
   * Map a ZaloPay payload → Core PaymentResult. Caller verifies the signature (callback,
   * redirect) or trusts the HTTPS response of the configured endpoint (query) first.
   *  - callback `data` fields: ZaloPay only calls back for paid orders → Success
   *  - query response (+ app_trans_id we asked about): return_code / sub_return_code
   *  - redirect query: status 1 = paid (display only — never applied)
   */
  processResult(raw: Record<string, string>): PaymentResult {
    // Redirect (browser) — informational
    if (raw.apptransid !== undefined) {
      const ok = raw.status === "1";
      return {
        txnCode: txnCodeFromAppTransId(raw.apptransid),
        outcome: ok ? "Success" : "Failed",
        amount: Number(raw.amount ?? 0),
        errorCode: ok ? undefined : str(raw.status),
        errorMessage: ok ? undefined : "Thanh toán ZaloPay chưa hoàn tất hoặc đã bị huỷ",
        bankCode: raw.bankcode || undefined,
        partnerRaw: raw,
      };
    }

    // Query response
    if (raw.return_code !== undefined) {
      const code = Number(raw.return_code);
      const sub = Number(raw.sub_return_code);
      const kind = classifyQuery(code, sub);
      const success = kind === "success";
      return {
        txnCode: txnCodeFromAppTransId(raw.app_trans_id ?? ""),
        outcome: success ? "Success" : kind === "failed" ? "Failed" : "Pending",
        partnerTxnId: raw.zp_trans_id && raw.zp_trans_id !== "0" ? raw.zp_trans_id : undefined,
        // Only a paid order carries `amount`; 0 = unknown (not compared for a failure).
        amount: Number(raw.amount ?? 0),
        paidAt: success ? (parseEpochMs(raw.server_time) ?? new Date()) : undefined,
        errorCode: success ? undefined : `${raw.return_code}/${raw.sub_return_code ?? ""}`,
        errorMessage: success
          ? undefined
          : subMessage(sub, raw.sub_return_message || raw.return_message),
        partnerRaw: raw,
      };
    }

    // Callback data — sent only for successful payments
    return {
      txnCode: txnCodeFromAppTransId(raw.app_trans_id ?? ""),
      outcome: "Success",
      partnerTxnId: raw.zp_trans_id || undefined,
      amount: Number(raw.amount ?? 0),
      paidAt: parseEpochMs(raw.server_time) ?? new Date(),
      bankCode: raw.channel ? `channel:${raw.channel}` : undefined,
      partnerRaw: raw,
    };
  }

  // ─── Refund ────────────────────────────────────────────────────────────────

  /**
   * POST /v2/refund then /v2/query_refund: ZaloPay's refund answer only acknowledges the request
   * (1 or 3 = accepted / processing); the refund status query gives the result. A refund still
   * processing is returned with `pending: true` and its m_refund_id for a later queryRefund().
   */
  async refund(req: RefundRequest): Promise<RefundResult> {
    const timestamp = Date.now();
    const params: Record<string, string> = {
      app_id: String(this.appIdNumber()),
      m_refund_id: zalopayRefundId(this.appId, new Date(timestamp)),
      zp_trans_id: req.partnerTxnId ?? "",
      amount: String(Math.round(req.amount)),
      timestamp: String(timestamp),
      description: sanitizeDescription(`Hoan tien ${req.txnCode} ${req.reason}`),
    };
    if (!params.zp_trans_id) {
      return {
        success: false,
        responseCode: "MISSING_ZP_TRANS_ID",
        message: "Giao dịch chưa có mã giao dịch ZaloPay (zp_trans_id)",
        signatureValid: false,
        partnerRequest: params,
        partnerRaw: null,
      };
    }
    const mac = refundMac(params, this.key1);
    const res = await this.post(this.apiUrl("refund"), {
      ...params,
      app_id: Number(params.app_id),
      amount: Number(params.amount),
      timestamp,
      mac,
    });
    const data = res.data;
    const code = Number(data.return_code);
    const sub = Number(data.sub_return_code);
    if (!res.ok || (code !== 1 && code !== 3)) {
      return {
        success: false,
        partnerRefundId: data.refund_id !== undefined ? str(data.refund_id) : undefined,
        responseCode: res.ok
          ? `${str(data.return_code)}/${str(data.sub_return_code)}`
          : `HTTP_${res.status}`,
        message: res.ok
          ? subMessage(sub, str(data.sub_return_message) || str(data.return_message))
          : str(data.message),
        signatureValid: res.ok && Number.isFinite(code),
        partnerRequest: params,
        partnerRaw: data,
      };
    }

    // Accepted → ask for the outcome once; still processing = pending (P5.3 polls later).
    const status = await this.queryRefund(params.m_refund_id).catch((e: unknown): RefundResult => ({
      success: false,
      pending: true,
      responseCode: "QUERY_FAILED",
      message: e instanceof Error ? e.message : "query_refund failed",
      signatureValid: false,
      partnerRequest: {},
      partnerRaw: null,
    }));
    return {
      ...status,
      partnerRefundId: data.refund_id !== undefined ? str(data.refund_id) : status.partnerRefundId,
      partnerRefundRef: params.m_refund_id,
      partnerRequest: params,
      partnerRaw: { refund: data, query: status.partnerRaw },
    };
  }

  /** Refund status by m_refund_id: 1 refunded · 3 (or sub -1 pending approval) processing · 2 failed. */
  async queryRefund(mRefundId: string): Promise<RefundResult> {
    const timestamp = Date.now();
    const params: Record<string, string> = {
      app_id: String(this.appIdNumber()),
      m_refund_id: mRefundId,
      timestamp: String(timestamp),
    };
    const mac = queryRefundMac(params.app_id, mRefundId, timestamp, this.key1);
    const res = await this.post(this.apiUrl("query_refund"), {
      ...params,
      app_id: Number(params.app_id),
      timestamp,
      mac,
    });
    const data = res.data;
    const code = Number(data.return_code);
    const sub = Number(data.sub_return_code);
    const pending = res.ok && (code === 3 || (code === 2 && (sub === -1 || sub === -16)));
    return {
      success: res.ok && code === 1,
      pending,
      partnerRefundRef: mRefundId,
      responseCode: res.ok
        ? `${str(data.return_code)}/${str(data.sub_return_code)}`
        : `HTTP_${res.status}`,
      message: !res.ok
        ? str(data.message)
        : code === 1
          ? "Hoàn tiền thành công"
          : pending
            ? "Hoàn tiền đang được ZaloPay xử lý"
            : subMessage(sub, str(data.sub_return_message) || str(data.return_message)),
      signatureValid: res.ok && Number.isFinite(code),
      partnerRequest: params,
      partnerRaw: data,
    };
  }

  // ─── Query (order status) ──────────────────────────────────────────────────

  /**
   * ZaloPay's query response is not signed and does not echo the request; trust comes from the
   * HTTPS channel to the configured endpoint (`signatureValid` = well-formed answer). The
   * app_trans_id asked about is added to `partnerRaw` so processResult can map it back.
   */
  async getStatus(query: StatusQuery): Promise<StatusResult> {
    const appTransId = query.partnerOrderId ?? zalopayAppTransId(query.txnCode);
    const appId = this.appIdNumber();
    const res = await this.post(this.apiUrl("query"), {
      app_id: appId,
      app_trans_id: appTransId,
      mac: queryMac(appId, appTransId, this.key1),
    });
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
    const code = Number(data.return_code);
    const sub = Number(data.sub_return_code);
    const wellFormed = Number.isFinite(code) && data.return_code !== undefined;
    const kind = wellFormed ? classifyQuery(code, sub) : "unknown";
    return {
      outcome:
        kind === "success"
          ? "Success"
          : kind === "failed"
            ? "Failed"
            : kind === "pending"
              ? "Pending"
              : "Unknown",
      responseCode: `${str(data.return_code)}/${str(data.sub_return_code)}`,
      transactionStatus: str(data.return_code),
      message:
        code === 1
          ? "Đã thanh toán"
          : code === 3
            ? "Chưa thanh toán / đang xử lý"
            : subMessage(sub, str(data.sub_return_message) || str(data.return_message)),
      partnerTxnId:
        data.zp_trans_id && str(data.zp_trans_id) !== "0" ? str(data.zp_trans_id) : undefined,
      signatureValid: wellFormed,
      partnerRaw: { ...data, app_trans_id: appTransId },
    };
  }

  // ─── Metadata / health ─────────────────────────────────────────────────────

  getConfigSchema(): ConfigSchemaField[] {
    return [
      { key: "merchant_code", label: "App ID", type: "string", required: true },
      {
        key: "api_key",
        label: "Key1",
        type: "secret",
        required: true,
        description: "Ký mac các yêu cầu gửi ZaloPay — lưu mã hoá AES-256-GCM",
      },
      {
        key: "secret_key",
        label: "Key2",
        type: "secret",
        required: true,
        description: "Kiểm mac callback / checksum redirect — lưu mã hoá AES-256-GCM",
      },
      {
        key: "endpoint_sandbox",
        label: "Create URL (Sandbox)",
        type: "url",
        required: true,
        description: ZALOPAY_SANDBOX_CREATE_URL,
      },
      {
        key: "endpoint_production",
        label: "Create URL (Production)",
        type: "url",
        required: false,
      },
      {
        key: "webhook_url",
        label: "Callback URL",
        type: "url",
        required: false,
        description: "Mặc định {APP_URL}/api/ipn/zalopay — phải truy cập được từ Internet",
      },
      { key: "timeout", label: "Timeout (ms)", type: "number", required: false },
    ];
  }

  /**
   * Credential probe: query an order that cannot exist. A valid app_id + key1 → ZaloPay answers
   * "order not found" (-101) or another payment-level code; a wrong app_id / key1 → -402.
   */
  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    try {
      const status = await this.getStatus({
        txnCode: "HEALTHCHECK",
        partnerOrderId: `${vnYymmdd()}_HEALTHCHECK${Date.now()}`,
        transactionDate: "",
        ipAddress: "127.0.0.1",
      });
      const latencyMs = Date.now() - started;
      const [code, sub] = status.responseCode.split("/").map(Number);
      const healthy =
        status.signatureValid &&
        Number.isFinite(code) &&
        !(code === 2 && API_ERROR_SUB_CODES.has(sub ?? NaN));
      return {
        healthy,
        latencyMs,
        message: healthy
          ? `ZaloPay ${this.config.environment}: kết nối và chữ ký hợp lệ (mã ${status.responseCode})`
          : `ZaloPay từ chối: mã ${status.responseCode || "?"} ${status.message}`.trim(),
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
