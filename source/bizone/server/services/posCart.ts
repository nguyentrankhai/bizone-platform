import { getRedis } from "@/lib/redis";
import { currentTenantId } from "@/lib/tenant";
import type { CartSnapshot } from "@/lib/pos/protocol";
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
