import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MoMo All-In-One v2 helpers (https://developers.momo.vn — "One-time payment").
 *
 * Every request/notification is signed with HMAC-SHA256(secretKey, rawSignature) in hex, where
 * rawSignature is `key=value` pairs joined by `&`, keys in alphabetical order, values as sent
 * (no URL encoding). Each API defines its own key list — kept here in one place.
 */

export const MOMO_SANDBOX_CREATE_URL = "https://test-payment.momo.vn/v2/gateway/api/create";
export const MOMO_PRODUCTION_CREATE_URL = "https://payment.momo.vn/v2/gateway/api/create";

/** captureWallet limits (VND) — MoMo rejects anything outside with resultCode 21/22. */
export const MOMO_MIN_AMOUNT = 1_000;
export const MOMO_MAX_AMOUNT = 50_000_000;

/** Signed field lists (alphabetical, as MoMo builds rawSignature). */
export const CREATE_SIGNED_FIELDS = [
  "accessKey",
  "amount",
  "extraData",
  "ipnUrl",
  "orderId",
  "orderInfo",
  "partnerCode",
  "redirectUrl",
  "requestId",
  "requestType",
] as const;

/** IPN (POST to ipnUrl) and redirect (query string on redirectUrl) share this list. */
export const RESULT_SIGNED_FIELDS = [
  "accessKey",
  "amount",
  "extraData",
  "message",
  "orderId",
  "orderInfo",
  "orderType",
  "partnerCode",
  "payType",
  "requestId",
  "responseTime",
  "resultCode",
  "transId",
] as const;

export const QUERY_SIGNED_FIELDS = ["accessKey", "orderId", "partnerCode", "requestId"] as const;

export const REFUND_SIGNED_FIELDS = [
  "accessKey",
  "amount",
  "description",
  "orderId",
  "partnerCode",
  "requestId",
  "transId",
] as const;

type Scalar = string | number | boolean | null | undefined;

/** `accessKey=…&amount=…&…` for the given field list (missing values → empty string). */
export function rawSignature(
  fields: readonly string[],
  values: Record<string, Scalar>,
  accessKey: string,
): string {
  return fields
    .map((f) => {
      const v = f === "accessKey" ? accessKey : values[f];
      return `${f}=${v === undefined || v === null ? "" : String(v)}`;
    })
    .join("&");
}

export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function signFields(
  fields: readonly string[],
  values: Record<string, Scalar>,
  accessKey: string,
  secretKey: string,
): string {
  return hmacSha256Hex(rawSignature(fields, values, accessKey), secretKey);
}

/** Constant-time comparison of two hex digests (case-insensitive). */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyFields(
  fields: readonly string[],
  values: Record<string, Scalar>,
  signature: string | undefined,
  accessKey: string,
  secretKey: string,
): boolean {
  if (!signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  return safeEqualHex(signFields(fields, values, accessKey, secretKey), signature);
}

/**
 * MoMo orderId must be unique per partnerCode. The first payment URL of a transaction uses the
 * txn_code itself; a regenerated URL (customer re-picks MoMo) appends `_<attempt>`.
 * txn_code never contains "_" (TXN-yyyymmdd-XXXXXX), so the mapping back is unambiguous.
 */
export function momoOrderId(txnCode: string, attempt = 1): string {
  return attempt > 1 ? `${txnCode}_${attempt}` : txnCode;
}

export function txnCodeFromOrderId(orderId: string): string {
  return orderId.replace(/_\d+$/, "");
}

/** Strip characters MoMo dislikes in orderInfo and cap the length. */
export function sanitizeOrderInfo(s: string): string {
  const cleaned = s
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[&=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Thanh toan").slice(0, 255);
}

/** Minutes until `expiredAt` for orderExpireTime (MoMo: 1…; default 100 if absent). */
export function orderExpireMinutes(
  expiredAt: Date | undefined,
  now = new Date(),
): number | undefined {
  if (!expiredAt) return undefined;
  return Math.max(1, Math.floor((expiredAt.getTime() - now.getTime()) / 60_000));
}

export type MomoResultKind = "success" | "pending" | "failed" | "unknown";

/**
 * resultCode → outcome for a *payment* result.
 *  - 0 success; 9000 authorized (autoCapture=false only); 1000/7000/7002 still in progress
 *  - user / issuer errors (1001…1080, 4xxx) are final failures
 *  - API-level errors (10…99) say nothing about the payment → "unknown" (do not fail the txn)
 */
export function classifyResultCode(code: number): MomoResultKind {
  if (code === 0) return "success";
  if (code === 9000 || code === 1000 || code === 7000 || code === 7002) return "pending";
  if (code >= 1001 && code < 2000) return "failed";
  if (code >= 4000 && code < 5000) return "failed";
  return "unknown";
}

export const MOMO_RESULT_MESSAGES: Record<number, string> = {
  0: "Thành công",
  10: "Hệ thống MoMo đang bảo trì",
  11: "Truy cập bị từ chối (cấu hình merchant)",
  12: "Phiên bản API không được hỗ trợ",
  13: "Xác thực merchant thất bại (partnerCode / accessKey / chữ ký)",
  20: "Yêu cầu sai định dạng",
  21: "Số tiền không hợp lệ",
  22: "Số tiền ngoài hạn mức",
  40: "requestId bị trùng",
  41: "orderId bị trùng",
  42: "orderId không hợp lệ hoặc không tồn tại",
  43: "Giao dịch đang được xử lý ở một yêu cầu khác",
  47: "Thông tin không áp dụng được",
  98: "Không tạo được mã QR",
  99: "Lỗi không xác định",
  1000: "Giao dịch đã khởi tạo, chờ người dùng xác nhận",
  1001: "Tài khoản không đủ tiền",
  1002: "Bị từ chối bởi nhà phát hành",
  1003: "Giao dịch đã bị huỷ",
  1004: "Vượt hạn mức thanh toán",
  1005: "URL / QR thanh toán đã hết hạn",
  1006: "Người dùng từ chối xác nhận thanh toán",
  1007: "Tài khoản người dùng không hoạt động",
  1017: "Giao dịch bị huỷ bởi merchant",
  1026: "Bị hạn chế theo khuyến mãi",
  1080: "Hoàn tiền thất bại",
  1081: "Hoàn tiền bị từ chối",
  1088: "Giao dịch gốc không hỗ trợ hoàn tiền",
  4001: "Tài khoản người dùng bị hạn chế",
  4002: "Tài khoản người dùng chưa xác thực",
  4100: "Người dùng đăng nhập thất bại",
  7000: "Giao dịch đang được xử lý",
  7002: "Giao dịch đang được nhà cung cấp xử lý",
  9000: "Giao dịch đã được xác nhận (chờ capture)",
};

export function resultMessage(code: number, fallback?: string): string {
  return MOMO_RESULT_MESSAGES[code] ?? fallback ?? `MoMo resultCode ${code}`;
}

/** MoMo responseTime / lastUpdated are epoch milliseconds. */
export function parseEpochMs(v: unknown): Date | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n) : undefined;
}
