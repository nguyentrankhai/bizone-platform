import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lazada Open Platform signatures (pure — unit tested):
 * - API calls: sort every parameter except `sign` (and file fields) by name, concatenate
 *   apiPath + name1 + value1 + name2 + value2…, HMAC-SHA256 with the app secret, UPPERCASE hex.
 * - push notifications: header Authorization = hex HMAC-SHA256(app_secret, app_key + body).
 */

export function lazadaSign(
  appSecret: string,
  apiPath: string,
  params: Record<string, string>,
): string {
  const base =
    apiPath +
    Object.keys(params)
      .filter((k) => k !== "sign")
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

export function lazadaPushSign(appKey: string, appSecret: string, body: string) {
  return createHmac("sha256", appSecret).update(`${appKey}${body}`, "utf8").digest("hex");
}

export function lazadaVerifyPush(
  appKey: string,
  appSecret: string,
  body: string,
  authorization: string | null,
): boolean {
  if (!authorization) return false;
  const expected = Buffer.from(lazadaPushSign(appKey, appSecret, body), "utf8");
  const actual = Buffer.from(authorization.trim().toLowerCase(), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** "2026-11-18 10:00:00 +0700" / ISO → Date */
export function lazadaDate(v: unknown): Date {
  const str = String(v ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})$/.exec(str);
  const d = m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : new Date(str);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Date → Lazada ISO 8601 with the VN offset (2026-11-18T10:00:00+07:00) */
export function lazadaIso(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 19);
  return `${vn}+07:00`;
}

/** XML-escape a value for the price_quantity payload */
export const xml = (v: string | number) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
