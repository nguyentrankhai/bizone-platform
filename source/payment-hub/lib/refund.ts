/**
 * Refund rules (P5.3, SRS-PH-REFUND-01/02) — pure, shared by refund.service, the admin UI and tests.
 *
 *  - only paid transactions (Success / PartiallyRefunded) can be refunded
 *  - the partner must have a refund API (VietQR has none) and the payment must carry the PSP's
 *    transaction id
 *  - within the refund window after payment
 *  - amount ≤ paid − already refunded − refunds still in flight (Pending / Processing); several
 *    partial refunds accumulate. Omitted amount = everything still refundable.
 */

export type RefundErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "TRANSACTION_NOT_REFUNDABLE"
  | "REFUND_NOT_SUPPORTED"
  | "REFUND_WINDOW_EXPIRED"
  | "REFUND_AMOUNT_EXCEEDED"
  | "REFUND_IN_PROGRESS"
  | "SERVICE_UNAVAILABLE";

/** HTTP status per error code (API-Design-PaymentHub §3.2, OpenAPI refund: 409 / 422). */
export const REFUND_ERROR_STATUS: Record<RefundErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  TRANSACTION_NOT_REFUNDABLE: 409,
  REFUND_NOT_SUPPORTED: 400,
  REFUND_WINDOW_EXPIRED: 400,
  REFUND_AMOUNT_EXCEEDED: 422,
  REFUND_IN_PROGRESS: 409,
  SERVICE_UNAVAILABLE: 503,
};

export const REFUND_REASON_MIN = 3;
export const REFUND_REASON_MAX = 255;

export interface RefundCapabilityInfo {
  partial: boolean;
  windowDays: number;
  async?: boolean;
}

export interface RefundFacts {
  status: string;
  amount: number;
  refundedAmount: number;
  /** Sum of the transaction's refunds still Pending / Processing */
  inflightAmount: number;
  paidAt: Date | null;
  partner: string | null;
  partnerTxnId: string | null;
  capability: RefundCapabilityInfo | null;
}

export interface RefundEligibility {
  refundable: boolean;
  code?: RefundErrorCode;
  reason?: string;
  partner: string | null;
  supported: boolean;
  partial: boolean;
  async: boolean;
  windowDays: number | null;
  windowEndsAt: Date | null;
  paidAmount: number;
  refundedAmount: number;
  inflightAmount: number;
  /** What a new refund may still take */
  refundableAmount: number;
}

const DAY_MS = 86_400_000;

export function evaluateRefund(f: RefundFacts, now: Date = new Date()): RefundEligibility {
  const cap = f.capability;
  const refundableAmount = Math.max(0, f.amount - f.refundedAmount - f.inflightAmount);
  const windowEndsAt =
    cap && f.paidAt ? new Date(f.paidAt.getTime() + cap.windowDays * DAY_MS) : null;
  const base: RefundEligibility = {
    refundable: false,
    partner: f.partner,
    supported: !!cap,
    partial: cap?.partial ?? false,
    async: cap?.async ?? false,
    windowDays: cap?.windowDays ?? null,
    windowEndsAt,
    paidAmount: f.amount,
    refundedAmount: f.refundedAmount,
    inflightAmount: f.inflightAmount,
    refundableAmount,
  };
  const deny = (code: RefundErrorCode, reason: string): RefundEligibility => ({
    ...base,
    code,
    reason,
  });

  if (f.status === "Refunded") {
    return deny("TRANSACTION_NOT_REFUNDABLE", "Giao dịch đã được hoàn tiền toàn bộ");
  }
  if (f.status !== "Success" && f.status !== "PartiallyRefunded") {
    return deny(
      "TRANSACTION_NOT_REFUNDABLE",
      `Chỉ hoàn tiền giao dịch đã thanh toán thành công (hiện tại: ${f.status})`,
    );
  }
  if (!cap) {
    return deny(
      "REFUND_NOT_SUPPORTED",
      `${f.partner ?? "Phương thức thanh toán này"} không hỗ trợ hoàn tiền qua Payment Hub — hoàn trả thủ công (chuyển khoản lại cho khách)`,
    );
  }
  if (!f.partnerTxnId) {
    return deny(
      "REFUND_NOT_SUPPORTED",
      `Giao dịch chưa có mã giao dịch của ${f.partner ?? "đối tác"} — không gửi được yêu cầu hoàn tiền`,
    );
  }
  if (!f.paidAt || !windowEndsAt || now.getTime() > windowEndsAt.getTime()) {
    return deny(
      "REFUND_WINDOW_EXPIRED",
      `Đã quá thời hạn hoàn tiền (${cap.windowDays} ngày sau khi thanh toán)`,
    );
  }
  if (refundableAmount <= 0) {
    return f.inflightAmount > 0
      ? deny(
          "REFUND_IN_PROGRESS",
          "Số tiền còn lại đang nằm trong yêu cầu hoàn tiền chờ đối tác xác nhận",
        )
      : deny("TRANSACTION_NOT_REFUNDABLE", "Giao dịch đã được hoàn tiền toàn bộ");
  }
  return { ...base, refundable: true };
}

export type RefundAmountCheck =
  | { ok: true; amount: number; type: "full" | "partial" }
  | { ok: false; code: RefundErrorCode; reason: string; details?: Record<string, number> };

/**
 * Amount of a new refund. `requested` undefined/null = refund everything still refundable.
 * `type` is "full" only when the whole paid amount goes back in one refund (VNPay 02 vs 03).
 */
export function checkRefundAmount(
  e: RefundEligibility,
  requested?: number | null,
): RefundAmountCheck {
  if (!e.refundable) {
    return { ok: false, code: e.code ?? "TRANSACTION_NOT_REFUNDABLE", reason: e.reason ?? "" };
  }
  const amount = requested ?? e.refundableAmount;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "Số tiền hoàn phải là số nguyên dương" };
  }
  if (amount > e.refundableAmount) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      reason: `Số tiền hoàn vượt quá số có thể hoàn (${e.refundableAmount.toLocaleString("vi-VN")} ₫)`,
      details: {
        requested: amount,
        refundable: e.refundableAmount,
        paid: e.paidAmount,
        refunded: e.refundedAmount,
        in_progress: e.inflightAmount,
      },
    };
  }
  const full = amount === e.paidAmount && e.refundedAmount === 0 && e.inflightAmount === 0;
  if (!full && !e.partial) {
    return {
      ok: false,
      code: "REFUND_NOT_SUPPORTED",
      reason: `${e.partner ?? "Đối tác"} chỉ hỗ trợ hoàn tiền toàn phần`,
    };
  }
  return { ok: true, amount, type: full ? "full" : "partial" };
}

/** Status of the transaction once `refunded` (total of completed refunds) is reached. */
export function statusAfterRefund(
  paid: number,
  refunded: number,
): "Refunded" | "PartiallyRefunded" {
  return refunded >= paid ? "Refunded" : "PartiallyRefunded";
}

/** Delay before the poller asks the PSP again about a Processing refund: 1, 2, 4 … ≤ 60 min. */
export function refundCheckDelayMs(checkCount: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, checkCount), 3_600_000);
}

/** REF-YYYYMMDD-XXXXXX, date in Vietnam time (business day). */
export function formatRefundCode(now: Date, suffix: string): string {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const ymd = vn.toISOString().slice(0, 10).replace(/-/g, "");
  return `REF-${ymd}-${suffix}`;
}

// ─── DTOs (API + admin UI) ────────────────────────────────────────────────────

export interface RefundView {
  id: number;
  refund_code: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: "Pending" | "Processing" | "Completed" | "Failed";
  reason: string;
  partner_refund_id: string | null;
  response_code: string | null;
  message: string | null;
  channel: "Merchant" | "Admin";
  processed_at: string | null;
  created_at: string;
  /** Admin views only */
  requested_by?: string | null;
  internal_note?: string | null;
  check_count?: number;
  last_checked_at?: string | null;
  manual_check?: boolean;
}

export interface RefundOutcomeView {
  refund: RefundView;
  transaction: {
    transaction_id: string;
    status: string;
    amount: number;
    refunded_amount: number;
    refundable_amount: number;
  };
}

/** RefundEligibility as sent to the browser (dates as ISO strings). */
export type RefundEligibilityDto = Omit<RefundEligibility, "windowEndsAt"> & {
  windowEndsAt: string | null;
};

export interface RefundOverviewDto {
  eligibility: RefundEligibilityDto;
  refunds: RefundView[];
}

export function toEligibilityDto(e: RefundEligibility): RefundEligibilityDto {
  return { ...e, windowEndsAt: e.windowEndsAt?.toISOString() ?? null };
}
