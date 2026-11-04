import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * VNPay 2.1.0 helpers — parameter encoding & HMAC-SHA512 secure hash.
 *
 * Signing rules (VNPay merchant docs / official Node demo):
 *  - drop vnp_SecureHash & vnp_SecureHashType
 *  - sort keys ascending
 *  - `key=encodeURIComponent(value)` with `%20` → `+`, joined by `&`
 *  - vnp_SecureHash = hex(HMAC-SHA512(hashSecret, signData))
 * API calls (refund / querydr) sign the `|`-joined values in a fixed field order.
 */

export const VNPAY_VERSION = "2.1.0";

const HASH_FIELDS = new Set(["vnp_SecureHash", "vnp_SecureHashType"]);

function encodeVnp(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/** Build the canonical `k=v&…` string (sorted, VNPay-encoded) — used both to sign and as query. */
export function buildSignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => !HASH_FIELDS.has(k) && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${encodeVnp(k)}=${encodeVnp(params[k])}`)
    .join("&");
}

export function hmacSha512(secret: string, data: string): string {
  return createHmac("sha512", secret).update(Buffer.from(data, "utf-8")).digest("hex");
}

export function signParams(params: Record<string, string>, secret: string): string {
  return hmacSha512(secret, buildSignData(params));
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a.toLowerCase(), "utf8");
  const bb = Buffer.from(b.toLowerCase(), "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Verify vnp_SecureHash of redirect/IPN params. */
export function verifyParams(params: Record<string, string>, secret: string): boolean {
  const received = params.vnp_SecureHash;
  if (!received) return false;
  return safeEqualHex(signParams(params, secret), received);
}

/** Pipe-joined checksum used by the merchant_webapi (refund, querydr). */
export function signPipe(values: (string | undefined)[], secret: string): string {
  return hmacSha512(secret, values.map((v) => v ?? "").join("|"));
}

/** yyyyMMddHHmmss in GMT+7 (VNPay requires Vietnam time regardless of server TZ). */
export function formatVnpDate(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => n.toString().padStart(2, "0");
  return (
    `${vn.getUTCFullYear()}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}` +
    `${p(vn.getUTCHours())}${p(vn.getUTCMinutes())}${p(vn.getUTCSeconds())}`
  );
}

/** Parse VNPay yyyyMMddHHmmss (GMT+7) → Date. */
export function parseVnpDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{14}$/.test(value)) return undefined;
  const n = (start: number, len: number) => Number(value.slice(start, start + len));
  const [y, mo, d, h, mi, s] = [n(0, 4), n(4, 2), n(6, 2), n(8, 2), n(10, 2), n(12, 2)];
  return new Date(Date.UTC(y, mo - 1, d, h - 7, mi, s));
}

/** VNPay vnp_OrderInfo: Vietnamese without accents, no special characters. */
export function sanitizeOrderInfo(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9 .,:_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 255) || "Thanh toan don hang"
  );
}

/** VNPay rejects IPv6 / missing IPs in some flows — normalise. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return "127.0.0.1";
  const v = ip.trim();
  if (v === "::1") return "127.0.0.1";
  if (v.startsWith("::ffff:")) return v.slice(7);
  return v;
}

/** Map our payment method → vnp_BankCode (empty = let customer choose on VNPay). */
export function bankCodeFor(method: string): string | undefined {
  switch (method) {
    case "vnpay_qr":
      return "VNPAYQR";
    case "vnpay_atm":
      return "VNBANK";
    case "vnpay_card":
      return "INTCARD";
    default:
      return undefined;
  }
}

/** vnp_ResponseCode descriptions (payment result). */
export const VNPAY_RESPONSE_MESSAGES: Record<string, string> = {
  "00": "Giao dịch thành công",
  "07": "Trừ tiền thành công, giao dịch bị nghi ngờ",
  "09": "Thẻ/Tài khoản chưa đăng ký InternetBanking",
  "10": "Xác thực thông tin thẻ/tài khoản quá 3 lần",
  "11": "Hết hạn chờ thanh toán",
  "12": "Thẻ/Tài khoản bị khóa",
  "13": "Nhập sai mật khẩu OTP",
  "24": "Khách hàng hủy giao dịch",
  "51": "Tài khoản không đủ số dư",
  "65": "Vượt quá hạn mức giao dịch trong ngày",
  "75": "Ngân hàng thanh toán đang bảo trì",
  "79": "Nhập sai mật khẩu thanh toán quá số lần quy định",
  "99": "Lỗi khác",
};
