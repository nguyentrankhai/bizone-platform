// DemoPay connector plugin — reference implementation of the Payment Hub plugin contract
// (documents/Connector-Plugin-Guide.md). Self-contained ES module: only node:crypto is imported,
// network calls use the global fetch (limited by the sandbox to manifest.network.allowedHosts +
// the partner config endpoints).
//
// DemoPay protocol (fake PSP, see ../mock-server.mjs):
//   POST {endpoint}/orders           create order → { code: "00", pay_url, qr }
//   GET  {endpoint}/orders/{id}      status       → { code, order_id, txn_id, amount, status, signature }
//   POST {endpoint}/refunds          refund       → { code, refund_id, signature }
//   GET  {endpoint}/health           health
//   callback (IPN) to notify_url:    { order_id, txn_id, amount, status, paid_at, signature }
// signature = hex(HMAC-SHA256(secret, fields joined by "|")).

import { createHmac, timingSafeEqual } from "node:crypto";

const CODE = "demopay";
const VERSION = "1.0.0";

const sign = (secret, ...parts) =>
  createHmac("sha256", secret).update(parts.join("|")).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** order id sent to DemoPay: txn code, or txn code + "_N" for the Nth payment URL */
const orderIdOf = (txnCode, attempt) =>
  attempt && attempt > 1 ? `${txnCode}_${attempt}` : txnCode;
const txnCodeOf = (orderId) => String(orderId).replace(/_\d+$/, "");

/** Error the core treats as "this request is wrong" (no fallback to another partner). */
function businessError(message) {
  const e = new Error(message);
  e.code = "VALIDATION_ERROR";
  return e;
}

/**
 * Static: which transaction a callback / return payload is about + its signature.
 * Called before the core knows which partner config (secrets) to use.
 */
export function callbackKeys(raw) {
  if (!raw.order_id || !raw.signature) return null;
  return { txnCode: txnCodeOf(raw.order_id), signature: raw.signature };
}

export function createConnector(config) {
  const base = String(config.endpoint || "").replace(/\/+$/, "");

  async function request(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(1000, config.timeoutMs || 30000));
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-api-key": config.apiKey },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  function toResult(raw) {
    const amount = Number(raw.amount);
    const outcome =
      raw.status === "PAID" ? "Success" : raw.status === "FAILED" ? "Failed" : "Pending";
    return {
      txnCode: txnCodeOf(raw.order_id),
      outcome,
      partnerTxnId: raw.txn_id || undefined,
      amount: Number.isFinite(amount) ? amount : 0,
      paidAt: outcome === "Success" && raw.paid_at ? new Date(raw.paid_at) : undefined,
      errorCode: outcome === "Failed" ? String(raw.error_code || "FAILED") : undefined,
      errorMessage:
        outcome === "Failed" ? String(raw.error_message || "Thanh toán thất bại") : undefined,
      partnerRaw: Object.fromEntries(
        Object.entries(raw)
          .filter(([k]) => k !== "signature")
          .map(([k, v]) => [k, String(v)]),
      ),
    };
  }

  const callbackSignature = (raw) =>
    sign(config.secretKey, raw.order_id, raw.txn_id ?? "", raw.amount, raw.status);

  return {
    code: CODE,
    version: VERSION,

    async createTransaction(req) {
      const orderId = orderIdOf(req.txnCode, req.attempt);
      const body = {
        merchant: config.merchantCode,
        order_id: orderId,
        amount: req.amount,
        description: req.description,
        return_url: req.returnUrl,
        notify_url: config.ipnUrl,
        expire_at: req.expiredAt ? new Date(req.expiredAt).toISOString() : undefined,
      };
      body.signature = sign(config.secretKey, body.merchant, orderId, req.amount);
      const { status, json } = await request("POST", "/orders", body);
      if (json.code === "21") throw businessError(json.message || "Số tiền không hợp lệ");
      if (status !== 200 || json.code !== "00" || !json.pay_url) {
        throw new Error(`DemoPay create failed: HTTP ${status} code ${json.code ?? "?"}`);
      }
      return {
        paymentUrl: json.pay_url,
        // orderId is what the core passes back as StatusQuery.partnerOrderId
        partnerRequest: {
          orderId,
          merchant: body.merchant,
          amount: String(req.amount),
          notify_url: body.notify_url ?? "",
        },
        partnerResponse: { code: json.code, pay_url: json.pay_url },
        partnerQr: json.qr ? { content: String(json.qr) } : undefined,
      };
    },

    processResult(raw) {
      return toResult(raw);
    },

    verifySignature(payload, signature) {
      if (!payload.order_id || !signature) return false;
      return safeEqual(callbackSignature(payload), signature);
    },

    async getStatus(query) {
      const orderId = query.partnerOrderId || query.txnCode;
      const sig = sign(config.secretKey, config.merchantCode, orderId);
      const { status, json } = await request(
        "GET",
        `/orders/${encodeURIComponent(orderId)}?merchant=${encodeURIComponent(config.merchantCode)}&signature=${sig}`,
      );
      if (status !== 200 || json.code !== "00") {
        return {
          outcome: "Unknown",
          responseCode: String(json.code ?? status),
          message: json.message || "DemoPay query failed",
          signatureValid: false,
          partnerRaw: json,
        };
      }
      const signatureValid = safeEqual(callbackSignature(json), json.signature || "");
      const r = toResult(json);
      return {
        outcome: signatureValid ? r.outcome : "Unknown",
        responseCode: json.code,
        transactionStatus: json.status,
        message: json.status,
        partnerTxnId: r.partnerTxnId,
        amount: r.amount,
        signatureValid,
        partnerRaw: Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)])),
      };
    },

    async refund(req) {
      const body = {
        merchant: config.merchantCode,
        txn_id: req.partnerTxnId,
        order_id: req.txnCode,
        amount: req.amount,
        reason: req.reason,
      };
      body.signature = sign(config.secretKey, body.merchant, body.txn_id, body.amount);
      const partnerRequest = {
        merchant: body.merchant,
        txn_id: String(body.txn_id),
        amount: String(body.amount),
      };
      let res;
      try {
        res = await request("POST", "/refunds", body);
      } catch (e) {
        // timeout / network: unknown outcome → stays Processing (never Failed)
        return {
          success: false,
          pending: true,
          responseCode: "TIMEOUT",
          message: String(e?.message ?? e),
          signatureValid: false,
          partnerRequest,
          partnerRaw: null,
        };
      }
      const { status, json } = res;
      const signatureValid =
        json.code === "00" &&
        safeEqual(sign(config.secretKey, json.refund_id ?? "", body.amount), json.signature || "");
      return {
        success: json.code === "00" && signatureValid,
        pending: status >= 500 || (json.code === "00" && !signatureValid),
        partnerRefundId: json.refund_id,
        responseCode: String(json.code ?? status),
        message:
          json.message || (json.code === "00" ? "Hoàn tiền thành công" : "Hoàn tiền thất bại"),
        signatureValid,
        partnerRequest,
        partnerRaw: json,
      };
    },

    getConfigSchema() {
      return [
        { key: "merchantCode", label: "Mã merchant DemoPay", type: "string", required: true },
        { key: "apiKey", label: "API Key", type: "secret", required: true },
        { key: "secretKey", label: "Secret (ký HMAC)", type: "secret", required: true },
        { key: "endpoint", label: "Endpoint", type: "url", required: true },
      ];
    },

    async healthCheck() {
      const started = Date.now();
      try {
        const { status, json } = await request("GET", "/health");
        return {
          healthy: status === 200 && json.status === "ok",
          latencyMs: Date.now() - started,
          message: status === 200 ? `DemoPay ${json.status ?? "?"}` : `HTTP ${status}`,
        };
      } catch (e) {
        return {
          healthy: false,
          latencyMs: Date.now() - started,
          message: String(e?.message ?? e),
        };
      }
    },
  };
}
