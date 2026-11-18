import { describe, expect, it } from "vitest";
import { addToCart, cartCount, MAX_LINES, parseCart, serializeCart, setQuantity } from "@/lib/cart";

describe("cart cookie", () => {
  it("round-trips and drops malformed lines", () => {
    const items = [
      { productId: 1, variantId: null, quantity: 2 },
      { productId: 3, variantId: 7, quantity: 1 },
    ];
    expect(parseCart(serializeCart(items))).toEqual(items);
    expect(
      parseCart('[{"p":0,"q":1},{"p":2,"v":-1,"q":1},{"p":4,"q":0},{"p":5,"q":"x"},{"p":6,"q":2}]'),
    ).toEqual([{ productId: 6, variantId: null, quantity: 2 }]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart('{"p":1}')).toEqual([]);
  });

  it("caps quantity and lines", () => {
    expect(parseCart('[{"p":1,"q":5000}]')[0].quantity).toBe(999);
    const many = Array.from({ length: 60 }, (_, i) => ({ p: i + 1, q: 1 }));
    expect(parseCart(JSON.stringify(many))).toHaveLength(MAX_LINES);
  });

  it("merges the same product / variant and keeps variants apart", () => {
    let c = addToCart([], { productId: 1, variantId: null, quantity: 1 });
    c = addToCart(c, { productId: 1, variantId: null, quantity: 2 });
    c = addToCart(c, { productId: 1, variantId: 9, quantity: 1 });
    expect(c).toEqual([
      { productId: 1, variantId: null, quantity: 3 },
      { productId: 1, variantId: 9, quantity: 1 },
    ]);
    expect(cartCount(c)).toBe(4);
    expect(setQuantity(c, 1, null, 0)).toEqual([{ productId: 1, variantId: 9, quantity: 1 }]);
    expect(setQuantity(c, 1, 9, 5)[1].quantity).toBe(5);
  });
});
