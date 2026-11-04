import { bizoneError } from "@/lib/errors";
import type { PaymentInput, PaymentMethod } from "@/lib/validators/pos";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ ngân hàng",
  wallet: "Ví điện tử",
  qr: "QR Code",
};

export interface Settlement {
  paid: number;
  change: number;
  /** Cash that stays in the drawer: cash received minus change given */
  netCash: number;
}

/**
 * Validate a (possibly mixed) payment against the invoice total.
 * Only cash may exceed what is owed — change is always given back in cash.
 */
export function settlePayments(total: number, payments: PaymentInput[]): Settlement {
  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0));
  if (paid < total) {
    throw bizoneError(
      "VALIDATION_ERROR",
      `Khách trả ${paid.toLocaleString("vi-VN")}₫, còn thiếu ${(total - paid).toLocaleString("vi-VN")}₫`,
    );
  }
  const cash = Math.round(
    payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0),
  );
  const change = paid - total;
  if (change > cash) {
    throw bizoneError(
      "VALIDATION_ERROR",
      "Thanh toán không dùng tiền mặt không được vượt quá số tiền cần trả",
    );
  }
  return { paid, change, netCash: cash - change };
}

/** Sum payments by method — used by the cash session summary */
export function sumByMethod(rows: { paymentMethod: string; amount: unknown }[]) {
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.paymentMethod] = (totals[r.paymentMethod] ?? 0) + Number(r.amount);
  return totals;
}
