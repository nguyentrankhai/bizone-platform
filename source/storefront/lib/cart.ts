/**
 * Shopping cart (P6.1): kept in a cookie per store as `[{ p, v, q }]` — product, variant,
 * quantity. Prices are never stored: BizOne re-prices the cart on every view and at checkout.
 */

export interface CartItem {
  productId: number;
  variantId: number | null;
  quantity: number;
}

export const MAX_LINES = 50;
export const MAX_QTY = 999;

export const cartCookieName = (slug: string) => `bz_cart_${slug}`;

export function parseCart(raw: string | undefined | null): CartItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: CartItem[] = [];
    for (const r of data as { p?: unknown; v?: unknown; q?: unknown }[]) {
      const productId = Number(r?.p);
      const variantId = r?.v == null ? null : Number(r.v);
      const quantity = Math.min(MAX_QTY, Math.floor(Number(r?.q)));
      if (!Number.isSafeInteger(productId) || productId <= 0) continue;
      if (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) continue;
      if (!(quantity >= 1)) continue;
      out.push({ productId, variantId, quantity });
    }
    return out.slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export function serializeCart(items: CartItem[]): string {
  return JSON.stringify(items.map((i) => ({ p: i.productId, v: i.variantId, q: i.quantity })));
}

const same = (a: CartItem, productId: number, variantId: number | null) =>
  a.productId === productId && a.variantId === variantId;

/** Add `quantity` of a product / variant (merged with an existing line) */
export function addToCart(items: CartItem[], add: CartItem): CartItem[] {
  const existing = items.find((i) => same(i, add.productId, add.variantId));
  if (existing)
    return items.map((i) =>
      same(i, add.productId, add.variantId)
        ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + add.quantity) }
        : i,
    );
  if (items.length >= MAX_LINES) return items;
  return [...items, { ...add, quantity: Math.min(MAX_QTY, add.quantity) }];
}

/** Set a line's quantity (0 removes it) */
export function setQuantity(
  items: CartItem[],
  productId: number,
  variantId: number | null,
  quantity: number,
): CartItem[] {
  if (quantity <= 0) return items.filter((i) => !same(i, productId, variantId));
  return items.map((i) =>
    same(i, productId, variantId) ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i,
  );
}

export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.quantity, 0);
