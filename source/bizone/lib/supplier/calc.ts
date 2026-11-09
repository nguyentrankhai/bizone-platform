/**
 * Pure purchase-order / supplier-debt arithmetic (no DB) — shared by purchaseOrder.service,
 * supplier.service and the PO form so the UI preview matches what the server stores.
 * Money is DECIMAL(15,2): every stored amount goes through round2.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Unit cost after the line discount (what one unit really costs) */
export function netUnitCost(unitCost: number, discountPercent = 0): number {
  return unitCost * (1 - discountPercent / 100);
}

export function lineTotal(quantity: number, unitCost: number, discountPercent = 0): number {
  return round2(quantity * netUnitCost(unitCost, discountPercent));
}

export interface PoLine {
  quantity: number;
  unitCost: number;
  discountPercent?: number;
}

export interface PoTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/** Totals of a PO; throws RangeError when the order discount exceeds the subtotal */
export function poTotals(lines: PoLine[], discountAmount = 0, taxAmount = 0): PoTotals {
  const subtotal = round2(
    lines.reduce((s, l) => s + lineTotal(l.quantity, l.unitCost, l.discountPercent), 0),
  );
  if (discountAmount > subtotal) {
    throw new RangeError("Chiết khấu đơn không được lớn hơn tổng tiền hàng");
  }
  return {
    subtotal,
    discountAmount: round2(discountAmount),
    taxAmount: round2(taxAmount),
    totalAmount: round2(subtotal - discountAmount + taxAmount),
  };
}

/**
 * Amount owed to the supplier for what has been received so far: the PO total (after order
 * discount and tax) prorated by the value of received lines. Fully received → exactly the total.
 */
export function receivedDebtAmount(
  lines: (PoLine & { receivedQuantity: number })[],
  totals: Pick<PoTotals, "subtotal" | "totalAmount">,
): number {
  if (lines.every((l) => l.receivedQuantity >= l.quantity)) return round2(totals.totalAmount);
  if (totals.subtotal <= 0) return 0;
  const received = lines.reduce(
    (s, l) =>
      s + lineTotal(Math.min(l.receivedQuantity, l.quantity), l.unitCost, l.discountPercent),
    0,
  );
  return round2((totals.totalAmount * received) / totals.subtotal);
}

/** Days in payment terms text: "30 ngày", "Net 45 days", "TT trong 15 ngày" → 30 / 45 / 15 */
export function paymentTermDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  const m = terms.match(/(\d{1,3})\s*(ngày|ngay|days?)\b/i) ?? terms.match(/^\s*(\d{1,3})\s*$/);
  if (!m) return null;
  const days = Number(m[1]);
  return days > 0 ? days : null;
}

/** YYYY-MM-DD + n days */
export function addDays(dateKey: string, days: number): string {
  const t = Date.parse(`${dateKey}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type DebtStatus = "pending" | "partial" | "paid";

export function debtStatus(total: number, paid: number): DebtStatus {
  if (round2(total - paid) <= 0) return "paid";
  return paid > 0 ? "partial" : "pending";
}

/** Past due date (VN calendar day) and still owing */
export function isOverdue(dueDateKey: string | null, remaining: number, todayKey: string): boolean {
  return !!dueDateKey && remaining > 0 && dueDateKey < todayKey;
}

export interface OpenDebt {
  id: number;
  remaining: number;
}

/**
 * Split a payment over open debts in the given order (oldest first): each debt takes at most
 * what it still owes. Throws RangeError when the amount exceeds the total owed.
 */
export function allocatePayment(
  amount: number,
  debts: OpenDebt[],
): { debtId: number; amount: number }[] {
  const owed = round2(debts.reduce((s, d) => s + d.remaining, 0));
  if (round2(amount) > owed) {
    throw new RangeError(`Số tiền trả vượt tổng công nợ còn lại (${owed})`);
  }
  const out: { debtId: number; amount: number }[] = [];
  let left = round2(amount);
  for (const d of debts) {
    if (left <= 0) break;
    const take = round2(Math.min(left, d.remaining));
    if (take <= 0) continue;
    out.push({ debtId: d.id, amount: take });
    left = round2(left - take);
  }
  return out;
}
