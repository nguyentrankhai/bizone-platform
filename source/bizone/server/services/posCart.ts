import { getRedis } from "@/lib/redis";
import { currentTenantId } from "@/lib/tenant";
import type { CartSnapshot, HeldCartSummary } from "@/lib/pos/protocol";
import { totalQuantity } from "@/lib/pos/held";
import { quoteCart } from "./pricing.service";

/** Server-side cart of a cash session, shared by both screens (and survives reconnects) */
export interface StoredCart {
  items: {
    id: string;
    productId: number;
    variantId: number | null;
    quantity: number;
    discountPercent: number;
  }[];
  customerId: number | null;
  couponCode: string | null;
  version: number;
}

const CART_TTL_SECONDS = 12 * 60 * 60;
// Session ids are per tenant database → the key must carry the tenant.
const cartKey = (sessionId: number) => `pos:cart:${currentTenantId()}:${sessionId}`;

export const emptyCart = (): StoredCart => ({
  items: [],
  customerId: null,
  couponCode: null,
  version: 0,
});

export async function loadCart(sessionId: number): Promise<StoredCart> {
  const raw = await getRedis().get(cartKey(sessionId));
  return raw ? (JSON.parse(raw) as StoredCart) : emptyCart();
}

export async function saveCart(sessionId: number, cart: StoredCart): Promise<StoredCart> {
  const next = { ...cart, version: cart.version + 1 };
  await getRedis().set(cartKey(sessionId), JSON.stringify(next), "EX", CART_TTL_SECONDS);
  return next;
}

export async function clearCart(sessionId: number): Promise<void> {
  await getRedis().del(cartKey(sessionId));
}

/** Price the stored cart for display (same rules as createInvoice) */
export async function snapshotCart(sessionId: number, cart: StoredCart): Promise<CartSnapshot> {
  const { totals, customer } = await quoteCart({
    items: cart.items,
    customerId: cart.customerId,
    couponCode: cart.couponCode,
  });
  return {
    ...totals,
    sessionId,
    couponCode: cart.couponCode,
    version: cart.version,
    customer: customer
      ? {
          id: customer.id,
          name: customer.fullName,
          phone: customer.phone,
          ranking: customer.ranking,
          points: customer.totalPoints,
        }
      : null,
  };
}

// ─── Held bills (tách / gộp hoá đơn, P4.5) ────────────────────────────────────

export interface HeldCart extends StoredCart {
  id: string;
  label: string;
  createdAt: string;
}

const heldKey = (sessionId: number) => `pos:held:${currentTenantId()}:${sessionId}`;

export async function listHeld(sessionId: number): Promise<HeldCart[]> {
  const all = await getRedis().hgetall(heldKey(sessionId));
  return Object.values(all)
    .map((v) => JSON.parse(v) as HeldCart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveHeld(sessionId: number, held: HeldCart): Promise<void> {
  const key = heldKey(sessionId);
  await getRedis()
    .multi()
    .hset(key, held.id, JSON.stringify(held))
    .expire(key, CART_TTL_SECONDS)
    .exec();
}

export async function deleteHeld(sessionId: number, ...ids: string[]): Promise<void> {
  if (ids.length) await getRedis().hdel(heldKey(sessionId), ...ids);
}

export async function clearHeld(sessionId: number): Promise<void> {
  await getRedis().del(heldKey(sessionId));
}

export function heldSummaries(held: HeldCart[]): HeldCartSummary[] {
  return held.map((h) => ({
    id: h.id,
    label: h.label,
    itemCount: h.items.length,
    quantity: totalQuantity(h.items),
    customerId: h.customerId,
    createdAt: h.createdAt,
  }));
}
