/**
 * Automatic POS promotions (P4.4) — pure functions, no I/O. The pricing service loads the
 * promotions that are running now (`PromoContext`) and calls `applyPromotions` on the cart
 * lines before `computeCart`. Order, each unit discounted by at most one promotion:
 *   1. flash sale — unit price drops to the flash price (within quantity / per-customer limits)
 *   2. combo — every complete set of the combo's products costs the combo price
 *   3. buy X get Y — each `buyQuantity` units bought adds `getQuantity` gift units
 *      (a gift line of the Y product, or the cheapest cart units of the Y category)
 * Money is whole VND.
 */
import type { CartLine, LinePromotion } from "./cart";

export interface FlashOffer {
  flashSaleId: number;
  /** flash_sale_products.id */
  itemId: number;
  name: string;
  productId: number;
  /** null = every variant of the product */
  variantId: number | null;
  flashPrice: number;
  /** Units left in the sale (null = unlimited) */
  remaining: number | null;
  /** Units this customer may still buy (null = unlimited) */
  perCustomerRemaining: number | null;
}

export interface ComboRule {
  id: number;
  name: string;
  comboPrice: number;
  items: { productId: number; quantity: number }[];
  /** Sets left (null = unlimited) */
  remaining: number | null;
}

export interface BuyXGetYRule {
  id: number;
  name: string;
  buyProductId: number | null;
  /** Category + all its descendants */
  buyCategoryIds: number[] | null;
  buyQuantity: number;
  getProductId: number | null;
  getCategoryIds: number[] | null;
  getQuantity: number;
  getDiscountPercent: number;
}

export interface GiftProduct {
  productId: number;
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  taxRate: number;
  categoryId: number | null;
}

export interface PromoContext {
  flash: FlashOffer[];
  combos: ComboRule[];
  buyXGetY: BuyXGetYRule[];
  giftProducts: Record<number, GiftProduct>;
}

export const EMPTY_PROMOS: PromoContext = { flash: [], combos: [], buyXGetY: [], giftProducts: {} };

/** What to record on the invoice (`promotion_usage`) and count against limits */
export interface PromotionUse {
  type: LinePromotion["type"];
  promotionId: number;
  /** flash_sale_products.id */
  itemRefId: number | null;
  productId: number | null;
  /** flash units / combo sets / gift units */
  quantity: number;
  discount: number;
}

const round = (n: number) => Math.round(n);
const fmt = (n: number) => `${n.toLocaleString("vi-VN")}₫`;

export const GIFT_LINE_PREFIX = "gift-";

export function isGiftLineId(id: string): boolean {
  return id.startsWith(GIFT_LINE_PREFIX);
}

function addPromo(line: CartLine, promo: LinePromotion) {
  line.promoDiscount = (line.promoDiscount ?? 0) + promo.discount;
  line.promotions = [...(line.promotions ?? []), promo];
}

export function applyPromotions(
  input: CartLine[],
  ctx: PromoContext,
): { lines: CartLine[]; uses: PromotionUse[] } {
  // Fresh copies: promotions are derived every time, never stored in the cart
  const lines: CartLine[] = input
    .filter((l) => !l.isGift)
    .map((l) => ({ ...l, promoDiscount: 0, promotions: [] }));
  const uses: PromotionUse[] = [];
  /** Units of each line already discounted by a promotion */
  const used = new Map<string, number>(lines.map((l) => [l.id, 0]));
  const free = (l: CartLine) => l.quantity - (used.get(l.id) ?? 0);

  // 1. Flash sale — cheapest running offer per line, limits shared across lines
  const offerLeft = new Map<number, number>();
  for (const o of ctx.flash) {
    offerLeft.set(o.itemId, Math.min(o.remaining ?? Infinity, o.perCustomerRemaining ?? Infinity));
  }
  for (const line of lines) {
    const offers = ctx.flash
      .filter(
        (o) =>
          o.productId === line.productId &&
          (o.variantId === null || o.variantId === line.variantId) &&
          o.flashPrice < line.unitPrice &&
          (offerLeft.get(o.itemId) ?? 0) > 0,
      )
      .sort((a, b) => a.flashPrice - b.flashPrice);
    const offer = offers[0];
    if (!offer) continue;
    const units = Math.min(line.quantity, offerLeft.get(offer.itemId) ?? 0);
    if (units <= 0) continue;
    const discount = round((line.unitPrice - offer.flashPrice) * units);
    offerLeft.set(offer.itemId, (offerLeft.get(offer.itemId) ?? 0) - units);
    used.set(line.id, units);
    addPromo(line, {
      type: "flash_sale",
      id: offer.flashSaleId,
      label: `Flash sale ${offer.name}: ${units} × ${fmt(offer.flashPrice)}`,
      discount,
    });
    uses.push({
      type: "flash_sale",
      promotionId: offer.flashSaleId,
      itemRefId: offer.itemId,
      productId: line.productId,
      quantity: units,
      discount,
    });
  }

  // 2. Combos — biggest saving per set first
  const comboSaving = (c: ComboRule) => {
    let original = 0;
    for (const it of c.items) {
      const line = lines.find((l) => l.productId === it.productId);
      if (!line) return 0;
      original += line.unitPrice * it.quantity;
    }
    return original - c.comboPrice;
  };
  for (const combo of [...ctx.combos].sort((a, b) => comboSaving(b) - comboSaving(a))) {
    if (combo.items.length === 0) continue;
    const saving = comboSaving(combo);
    if (saving <= 0) continue;
    const avail = (productId: number) =>
      lines.filter((l) => l.productId === productId).reduce((s, l) => s + free(l), 0);
    let sets = Math.min(...combo.items.map((it) => Math.floor(avail(it.productId) / it.quantity)));
    if (combo.remaining !== null) sets = Math.min(sets, combo.remaining);
    if (sets <= 0) continue;

    // Take the units, cheapest-first not needed: allocate the saving by value of units taken
    const taken: { line: CartLine; units: number }[] = [];
    for (const it of combo.items) {
      let need = it.quantity * sets;
      for (const l of lines.filter((x) => x.productId === it.productId)) {
        const units = Math.min(need, free(l));
        if (units <= 0) continue;
        taken.push({ line: l, units });
        used.set(l.id, (used.get(l.id) ?? 0) + units);
        need -= units;
        if (need === 0) break;
      }
    }
    const total = saving * sets;
    const value = taken.reduce((s, t) => s + t.line.unitPrice * t.units, 0);
    let left = round(total);
    taken.forEach((t, i) => {
      const share =
        i === taken.length - 1 ? left : round((total * t.line.unitPrice * t.units) / value);
      left -= share;
      addPromo(t.line, {
        type: "combo",
        id: combo.id,
        label: `Combo ${combo.name} × ${sets}`,
        discount: share,
      });
    });
    uses.push({
      type: "combo",
      promotionId: combo.id,
      itemRefId: null,
      productId: null,
      quantity: sets,
      discount: round(total),
    });
  }

  // 3. Buy X get Y
  const gifts: CartLine[] = [];
  const matches = (l: CartLine, productId: number | null, categoryIds: number[] | null) =>
    (productId !== null && l.productId === productId) ||
    (productId === null &&
      categoryIds !== null &&
      l.categoryId != null &&
      categoryIds.includes(l.categoryId));
  for (const rule of ctx.buyXGetY) {
    if (rule.buyQuantity <= 0 || rule.getQuantity <= 0 || rule.getDiscountPercent <= 0) continue;
    const buyLines = lines.filter((l) => matches(l, rule.buyProductId, rule.buyCategoryIds));
    const buyUnits = buyLines.reduce((s, l) => s + free(l), 0);

    if (rule.getProductId !== null) {
      // Gift line of product Y, added automatically
      const g = ctx.giftProducts[rule.getProductId];
      const times = Math.floor(buyUnits / rule.buyQuantity);
      if (!g || times <= 0) continue;
      const qty = times * rule.getQuantity;
      for (const l of buyLines) used.set(l.id, l.quantity); // buy units can't count twice
      const discount = round((g.unitPrice * qty * rule.getDiscountPercent) / 100);
      gifts.push({
        id: `${GIFT_LINE_PREFIX}${rule.id}`,
        productId: g.productId,
        variantId: null,
        categoryId: g.categoryId,
        name: g.name,
        sku: g.sku,
        unit: g.unit,
        unitPrice: g.unitPrice,
        quantity: qty,
        discountPercent: 0,
        taxRate: g.taxRate,
        isGift: true,
        promoDiscount: discount,
        promotions: [
          {
            type: "buy_x_get_y",
            id: rule.id,
            label:
              rule.getDiscountPercent >= 100
                ? `Quà tặng — ${rule.name}`
                : `Mua kèm giảm ${rule.getDiscountPercent}% — ${rule.name}`,
            discount,
          },
        ],
      });
      uses.push({
        type: "buy_x_get_y",
        promotionId: rule.id,
        itemRefId: null,
        productId: g.productId,
        quantity: qty,
        discount,
      });
    } else if (rule.getCategoryIds) {
      // Cheapest units of category Y already in the cart. When the same units can be both
      // bought and given ("mua 2 tặng 1" in one category), a deal needs buy + get units.
      const getLines = lines
        .filter((l) => matches(l, null, rule.getCategoryIds))
        .sort((a, b) => a.unitPrice - b.unitPrice);
      const overlap = getLines.some((l) => buyLines.includes(l));
      const times = Math.floor(
        buyUnits / (overlap ? rule.buyQuantity + rule.getQuantity : rule.buyQuantity),
      );
      let qty = times * rule.getQuantity;
      if (qty <= 0) continue;
      let total = 0;
      for (const l of getLines) {
        const units = Math.min(qty, free(l));
        if (units <= 0) continue;
        const discount = round((l.unitPrice * units * rule.getDiscountPercent) / 100);
        used.set(l.id, (used.get(l.id) ?? 0) + units);
        addPromo(l, {
          type: "buy_x_get_y",
          id: rule.id,
          label: `${rule.name}: ${units} sản phẩm giảm ${rule.getDiscountPercent}%`,
          discount,
        });
        total += discount;
        qty -= units;
        if (qty === 0) break;
      }
      const given = times * rule.getQuantity - qty;
      if (given > 0) {
        uses.push({
          type: "buy_x_get_y",
          promotionId: rule.id,
          itemRefId: null,
          productId: null,
          quantity: given,
          discount: total,
        });
      }
    }
  }

  return { lines: [...lines, ...gifts], uses };
}
