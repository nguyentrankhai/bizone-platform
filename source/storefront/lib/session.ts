import "server-only";
import { cookies } from "next/headers";
import type { StoreRef } from "./store";
import { cartCookieName, parseCart, serializeCart, type CartItem } from "./cart";

/**
 * Cookies of the storefront (all httpOnly, per store):
 *  - `bz_cst_{slug}`    customer session token issued by BizOne (30 days)
 *  - `bz_cart_{slug}`   cart lines
 *  - `bz_guest_{slug}`  orders placed without an account: `code:phone` pairs, so a guest can
 *                       come back from Payment Hub and follow the order without logging in
 *  - `bz_src`           utm_source of the last social link followed (P6.3, set by `proxy.ts`)
 */

const secure = () =>
  process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "true";
const base = () => ({ httpOnly: true, sameSite: "lax" as const, secure: secure(), path: "/" });

const tokenName = (slug: string) => `bz_cst_${slug}`;
const guestName = (slug: string) => `bz_guest_${slug}`;

export async function customerToken(store: StoreRef): Promise<string | null> {
  return (await cookies()).get(tokenName(store.slug))?.value ?? null;
}

export async function setCustomerToken(store: StoreRef, token: string | null) {
  const jar = await cookies();
  if (token) jar.set(tokenName(store.slug), token, { ...base(), maxAge: 30 * 86_400 });
  else jar.delete(tokenName(store.slug));
}

/** Where the buyer came from (utm_source), sent with the order */
export async function orderSource(): Promise<string | null> {
  const v = (await cookies()).get("bz_src")?.value ?? "";
  return /^[a-z0-9._-]{1,40}$/.test(v) ? v : null;
}

export async function readCart(store: StoreRef): Promise<CartItem[]> {
  return parseCart((await cookies()).get(cartCookieName(store.slug))?.value);
}

export async function writeCart(store: StoreRef, items: CartItem[]) {
  const jar = await cookies();
  if (items.length === 0) jar.delete(cartCookieName(store.slug));
  else
    jar.set(cartCookieName(store.slug), serializeCart(items), { ...base(), maxAge: 30 * 86_400 });
}

/** Phone numbers of guest orders remembered on this browser */
export async function guestOrders(store: StoreRef): Promise<Map<string, string>> {
  const raw = (await cookies()).get(guestName(store.slug))?.value ?? "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [code, phone] = pair.split(":");
    if (code && /^[A-Z0-9-]{6,50}$/.test(code) && /^0\d{9}$/.test(phone ?? ""))
      map.set(code, phone);
  }
  return map;
}

export async function rememberGuestOrder(store: StoreRef, code: string, phone: string) {
  const map = await guestOrders(store);
  map.delete(code);
  const pairs = [`${code}:${phone}`, ...[...map].map(([c, p]) => `${c}:${p}`)].slice(0, 10);
  (await cookies()).set(guestName(store.slug), pairs.join(","), { ...base(), maxAge: 90 * 86_400 });
}
