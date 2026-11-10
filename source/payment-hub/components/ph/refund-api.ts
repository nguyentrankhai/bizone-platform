import type { RefundOutcomeView } from "@/lib/refund";

/** Client helpers for the admin refund API (/api/internal/…, Bearer token). */

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

async function post(token: string, path: string, body: unknown): Promise<RefundOutcomeView> {
  const res = await fetch(`/api/internal${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Envelope | null;
  if (res.ok && json?.success && json.data) return json.data;
  const message =
    res.status === 401
      ? "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang"
      : res.status === 403
        ? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
        : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
  throw new RefundApiError(message, res.status, json?.error?.code, json?.data);
}

export const refundApi = {
  /** 200 Completed · 202 Processing · throws RefundApiError (502 = PSP refused, with outcome) */
  create: (
    token: string,
    txnId: number,
    body: { amount: number | null; reason: string; note?: string },
  ) => post(token, `/transactions/${txnId}/refund`, body),
  check: (token: string, refundId: number) => post(token, `/refunds/${refundId}/check`, {}),
  resolve: (
    token: string,
    refundId: number,
    body: { outcome: "Completed" | "Failed"; note: string; partner_refund_id?: string },
  ) => post(token, `/refunds/${refundId}/resolve`, body),
};
