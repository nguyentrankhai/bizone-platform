import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ZaloPay OpenAPI v2 helpers (https://docs.zalopay.vn — Order create / query, callback, refund).
 *
 * Two keys per app:
 *  - key1 ("mac key")      signs every request Payment Hub sends (create, query, refund, query_refund)
 *  - key2 ("callback key") verifies what ZaloPay sends back (callback `data`, redirect checksum)
 * mac = hex(HMAC-SHA256(key, fields joined by "|")) — each API has its own field list, kept here.
 */

export const ZALOPAY_SANDBOX_CREATE_URL = "https://sb-openapi.zalopay.vn/v2/create";
export const ZALOPAY_PRODUCTION_CREATE_URL = "https://openapi.zalopay.vn/v2/create";

/** expire_duration_seconds bounds accepted by ZaloPay. */
export const ZALOPAY_MIN_EXPIRE_S = 300;
export const ZALOPAY_MAX_EXPIRE_S = 2_592_000;

export function hmacSha256Hex(data: string, key: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests (case-insensitive). */
export function safeEqualHex(a: string, b: string | undefined): boolean {
  if (!b || !/^[0-9a-fA-F]{64}$/.test(b)) return false;
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

type Scalar = string | number | null | undefined;
const s = (v: Scalar) => (v === undefined || v === null ? "" : String(v));

/** Create order: app_id|app_trans_id|app_user|amount|app_time|embed_data|item (key1). */
export function createMac(p: Record<string, Scalar>, key1: string): string {
  return hmacSha256Hex(
    [p.app_id, p.app_trans_id, p.app_user, p.amount, p.app_time, p.embed_data, p.item]
      .map(s)
      .join("|"),
    key1,
  );
}

/** Query order: app_id|app_trans_id|key1 (key1). */
export function queryMac(appId: Scalar, appTransId: string, key1: string): string {
  return hmacSha256Hex(`${s(appId)}|${appTransId}|${key1}`, key1);
}

/**
 * Refund: app_id|zp_trans_id|amount|description|timestamp (key1);
 * with a refund fee: app_id|zp_trans_id|amount|refund_fee_amount|description|timestamp.
 */
export function refundMac(p: Record<string, Scalar>, key1: string): string {
  const parts =
    p.refund_fee_amount !== undefined && p.refund_fee_amount !== ""
      ? [p.app_id, p.zp_trans_id, p.amount, p.refund_fee_amount, p.description, p.timestamp]
      : [p.app_id, p.zp_trans_id, p.amount, p.description, p.timestamp];
  return hmacSha256Hex(parts.map(s).join("|"), key1);
}

/** Query refund: app_id|m_refund_id|timestamp (key1). */
export function queryRefundMac(appId: Scalar, mRefundId: string, timestamp: Scalar, key1: string) {
  return hmacSha256Hex(`${s(appId)}|${mRefundId}|${s(timestamp)}`, key1);
}

/** Callback: mac = HMAC(key2, data) where `data` is the JSON string exactly as received. */
export function verifyCallbackMac(data: string, mac: string | undefined, key2: string): boolean {
  return safeEqualHex(hmacSha256Hex(data, key2), mac);
}

/** Fields of the browser redirect (redirecturl) signed by `checksum`, in order. */
export const REDIRECT_SIGNED_FIELDS = [
  "appid",
  "apptransid",
  "pmcid",
  "bankcode",
  "amount",
  "discountamount",
  "status",
] as const;

/** Redirect: checksum = HMAC(key2, appid|apptransid|pmcid|bankcode|amount|discountamount|status). */
export function redirectChecksum(p: Record<string, Scalar>, key2: string): string {
  return hmacSha256Hex(REDIRECT_SIGNED_FIELDS.map((f) => s(p[f])).join("|"), key2);
}

// ─── app_trans_id ⇄ txn_code ────────────────────────────────────────────────

/** yymmdd in Vietnam time (GMT+7) — ZaloPay requires app_trans_id to start with it. */
export function vnYymmdd(d = new Date()): string {
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(2, 10).replace(/-/g, "");
}

/**
 * app_trans_id = `yymmdd_<txn_code without "-">[_<attempt>]` (≤ 40 chars, unique per app_id).
 * txn_code is TXN-yyyymmdd-NNNNNN; dashes are dropped so the id stays [0-9A-Za-z_]. A regenerated
 * payment URL (customer re-picks ZaloPay) appends `_<attempt>`, like MoMo's orderId.
 */
export function zalopayAppTransId(txnCode: string, attempt = 1, now = new Date()): string {
  const compact = txnCode.replace(/[^0-9A-Za-z]/g, "");
  const id = `${vnYymmdd(now)}_${compact}${attempt > 1 ? `_${attempt}` : ""}`;
  return id.slice(0, 40);
}

/** Inverse of zalopayAppTransId (date prefix and attempt suffix ignored). */
export function txnCodeFromAppTransId(appTransId: string): string {
  const m = /^\d{6}_([0-9A-Za-z]+)(?:_\d+)?$/.exec(appTransId);
  if (!m) return appTransId;
  const body = m[1]!;
  const txn = /^TXN(\d{8})(\d{6})$/.exec(body);
  return txn ? `TXN-${txn[1]}-${txn[2]}` : body;
}

/** m_refund_id = yymmdd_appid_<unique> (ZaloPay refund TXID format). */
export function zalopayRefundId(appId: string, now = new Date()): string {
  const uniq = `${now.getTime()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
  return `${vnYymmdd(now)}_${appId}_${uniq}`;
}

/** Seconds ZaloPay may keep the order open so it never outlives the Payment Hub transaction. */
export function expireDurationSeconds(
  expiredAt: Date | undefined,
  now = new Date(),
): number | undefined {
  if (!expiredAt) return undefined;
  const left = Math.floor((expiredAt.getTime() - now.getTime()) / 1000);
  return Math.min(left, ZALOPAY_MAX_EXPIRE_S);
}

/** Strip control characters and cap at ZaloPay's description length. */
export function sanitizeDescription(text: string): string {
  const cleaned = text
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Thanh toan").slice(0, 256);
}

// ─── Result codes ───────────────────────────────────────────────────────────

/** sub_return_code values that describe the API call itself (credentials, input, availability). */
export const API_ERROR_SUB_CODES = new Set([-401, -402, -429, -500, -999]);

export type ZalopayResultKind = "success" | "pending" | "failed" | "unknown";

/**
 * Query order status → outcome.
 *  - return_code 1 → paid; 3 → processing / not paid yet
 *  - 2 with a payment-level sub code (expired, balance, bank, spending limit…) → final failure
 *  - 2 with an API-level sub code (mac, data, rate limit, maintenance) or -101 / -92 (order not
 *    found / bad id) says nothing about the payment → unknown (never fail the transaction on it)
 */
export function classifyQuery(returnCode: number, subReturnCode: number): ZalopayResultKind {
  if (returnCode === 1) return "success";
  if (returnCode === 3) return "pending";
  if (returnCode !== 2) return "unknown";
  if (API_ERROR_SUB_CODES.has(subReturnCode) || subReturnCode === -101 || subReturnCode === -92) {
    return "unknown";
  }
  return "failed";
}

export const ZALOPAY_SUB_MESSAGES: Record<number, string> = {
  [-13]: "Đã quá thời hạn được hoàn tiền",
  [-14]: "Số tiền hoàn không hợp lệ",
  [-32]: "Giao dịch không hỗ trợ hoàn tiền một phần",
  [-54]: "Đơn ZaloPay đã hết hạn thanh toán",
  [-63]: "Số dư ví ZaloPay không đủ",
  [-68]: "app_trans_id bị trùng",
  [-92]: "app_trans_id sai định dạng",
  [-101]: "Không tìm thấy giao dịch tại ZaloPay",
  [-217]: "Lỗi từ ngân hàng",
  [-401]: "Dữ liệu yêu cầu không hợp lệ",
  [-402]: "Sai app_id hoặc chữ ký (mac)",
  [-429]: "Vượt giới hạn tần suất gọi API",
  [-500]: "Lỗi hệ thống ZaloPay",
  [-999]: "ZaloPay đang bảo trì",
};

export function subMessage(sub: number, fallback?: string): string {
  if (sub <= -1330 && sub >= -1333) return "Vượt hạn mức chi tiêu trong ngày";
  if (sub <= -1340 && sub >= -1343) return "Vượt hạn mức chi tiêu trong tháng";
  return ZALOPAY_SUB_MESSAGES[sub] ?? fallback ?? `ZaloPay sub_return_code ${sub}`;
}

/** epoch-ms timestamps (server_time, app_time). */
export function parseEpochMs(v: unknown): Date | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n) : undefined;
}
