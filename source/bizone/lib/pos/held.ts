/**
 * Tách / gộp hoá đơn tại POS (P4.5) — pure helpers over the stored cart lines, shared by the
 * WebSocket server (server/ws/pos.ts) and the unit tests.
 *
 * A bill being rung up can be split (some quantities move to a new held bill, paid separately →
 * 1 bill becomes 2 invoices) and held bills can be merged back into the current cart.
 */

export interface CartLine {
  id: string;
  productId: number;
  variantId: number | null;
  quantity: number;
  discountPercent: number;
}

export class HeldCartError extends Error {}

export const MAX_HELD_CARTS = 20;

const lineId = () => Math.random().toString(36).slice(2, 10);
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Move `quantity` of each chosen line out of `lines`. Returns the lines that stay and the
 * lines of the new bill (fresh ids). Both sides must keep at least one line.
 */
export function splitLines(
  lines: CartLine[],
  pick: { itemId: string; quantity: number }[],
): { stay: CartLine[]; moved: CartLine[] } {
  const want = new Map<string, number>();
  for (const p of pick) {
    if (!(p.quantity > 0)) continue;
    want.set(p.itemId, round((want.get(p.itemId) ?? 0) + p.quantity));
  }
  if (want.size === 0) throw new HeldCartError("Chọn sản phẩm và số lượng cần tách");

  const stay: CartLine[] = [];
  const moved: CartLine[] = [];
  for (const line of lines) {
    const q = want.get(line.id);
    if (q === undefined) {
      stay.push({ ...line });
      continue;
    }
    if (q > line.quantity + 1e-9)
      throw new HeldCartError(`Số lượng tách vượt số lượng trong giỏ (${line.quantity})`);
    moved.push({ ...line, id: lineId(), quantity: q });
    const rest = round(line.quantity - q);
    if (rest > 0) stay.push({ ...line, quantity: rest });
    want.delete(line.id);
  }
  if (want.size > 0) throw new HeldCartError("Dòng hàng không còn trong giỏ");
  if (stay.length === 0)
    throw new HeldCartError("Không thể tách toàn bộ giỏ — dùng “Lưu tạm” để giữ đơn");
  return { stay, moved };
}

/** Add `source` lines into `target`: same product + variant are summed (target keeps its discount) */
export function mergeLines(target: CartLine[], ...sources: CartLine[][]): CartLine[] {
  const out = target.map((l) => ({ ...l }));
  for (const src of sources) {
    for (const line of src) {
      const same = out.find(
        (l) => l.productId === line.productId && l.variantId === line.variantId,
      );
      if (same) same.quantity = round(same.quantity + line.quantity);
      else out.push({ ...line, id: lineId() });
    }
  }
  return out;
}

export const totalQuantity = (lines: CartLine[]) =>
  round(lines.reduce((s, l) => s + l.quantity, 0));
