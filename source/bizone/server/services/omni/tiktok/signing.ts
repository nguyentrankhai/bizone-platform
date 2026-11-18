import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TikTok Shop Partner API (202309) signatures (pure — unit tested):
 * - API calls: query params except `sign` / `access_token`, sorted by key, concatenated as
 *   key + value, prefixed with the path; the JSON body is appended (not for multipart uploads);
 *   the whole string is wrapped in app_secret on both sides and HMAC-SHA256'd with app_secret.
 * - webhooks: header Authorization = HMAC-SHA256(app_secret, app_key + raw body).
 * All lowercase hex; timestamp in seconds.
 */

const hmac = (key: string, base: string) =>
  createHmac("sha256", key).update(base, "utf8").digest("hex");

export function tiktokSignBase(
  path: string,
  query: Record<string, string>,
  body: string | null,
): string {
  const params = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${query[k]}`)
    .join("");
  return `${path}${params}${body ?? ""}`;
}

export function tiktokSign(
  appSecret: string,
  path: string,
  query: Record<string, string>,
  body: string | null,
): string {
  return hmac(appSecret, `${appSecret}${tiktokSignBase(path, query, body)}${appSecret}`);
}

export function tiktokPushSign(appKey: string, appSecret: string, body: string) {
  return hmac(appSecret, `${appKey}${body}`);
}

export function tiktokVerifyPush(
  appKey: string,
  appSecret: string,
  body: string,
  authorization: string | null,
): boolean {
  if (!authorization) return false;
  const expected = Buffer.from(tiktokPushSign(appKey, appSecret, body), "utf8");
  const actual = Buffer.from(authorization.trim().toLowerCase(), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
