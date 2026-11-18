import type { RefundOutcomeView } from "@/lib/refund";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for the admin refund API (/api/internal/…, session token via adminFetch). */

export class RefundApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    /** Refund created but refused by the PSP (502): its record, for display */
    public readonly outcome?: RefundOutcomeView,
  ) {
    super(message);
  }
}

interface Envelope {
  success?: boolean;
  data?: RefundOutcomeView;
  error?: { code?: string; message?: string };
}

async function post(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<RefundOutcomeView> {
  const res = await adminFetch(`/api/internal${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Envelope | null;
  if (res.ok && json?.success && json.data) return json.data;
  const message =
    res.status === 401
      ? "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại"
      : res.status === 403
        ? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
        : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
  throw new RefundApiError(message, res.status, json?.error?.code, json?.data);
}

export const refundApi = {
  /** 200 Completed · 202 Processing · throws RefundApiError (502 = PSP refused, with outcome) */
  /** `idempotencyKey`: one per form opening — a double submit / retry returns the same refund */
  create: (
    txnId: number,
    body: { amount: number | null; reason: string; note?: string },
    idempotencyKey?: string,
  ) => post(`/transactions/${txnId}/refund`, body, idempotencyKey),
  check: (refundId: number) => post(`/refunds/${refundId}/check`, {}),
  resolve: (
    refundId: number,
    body: { outcome: "Completed" | "Failed"; note: string; partner_refund_id?: string },
  ) => post(`/refunds/${refundId}/resolve`, body),
};
