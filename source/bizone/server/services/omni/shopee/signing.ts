import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopee Open Platform v2 signatures (pure — unit tested):
 * - public APIs (auth, media upload): HMAC-SHA256(partner_key, partner_id + path + timestamp)
 * - shop APIs: HMAC-SHA256(partner_key, partner_id + path + timestamp + access_token + shop_id)
 * - push notifications: header Authorization = HMAC-SHA256(partner_key, push_url + "|" + body)
 * All lowercase hex; timestamp in seconds.
 */

const hmac = (key: string, base: string) =>
  createHmac("sha256", key).update(base, "utf8").digest("hex");

export function shopeePublicSign(partnerId: string, partnerKey: string, path: string, ts: number) {
  return hmac(partnerKey, `${partnerId}${path}${ts}`);
}

export function shopeeShopSign(
  partnerId: string,
  partnerKey: string,
  path: string,
  ts: number,
  accessToken: string,
  shopId: string,
) {
  return hmac(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopId}`);
}

export function shopeePushSign(partnerKey: string, pushUrl: string, body: string) {
  return hmac(partnerKey, `${pushUrl}|${body}`);
}

export function shopeeVerifyPush(
  partnerKey: string,
  pushUrl: string,
  body: string,
  authorization: string | null,
): boolean {
  if (!authorization) return false;
  const expected = Buffer.from(shopeePushSign(partnerKey, pushUrl, body), "utf8");
  const actual = Buffer.from(authorization.trim().toLowerCase(), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
