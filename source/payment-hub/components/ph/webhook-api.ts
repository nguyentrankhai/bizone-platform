import type {
  WebhookConfigView,
  WebhookLogDetail,
  WebhookLogView,
  WebhookStats,
} from "@/lib/webhook-events";

/** Client helpers for /api/internal/webhooks + /api/internal/webhook-logs (Bearer token). */

export class WebhookApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  error?: { message?: string; details?: Record<string, string[]> };
}

async function call<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: Envelope<T>["meta"] }> {
  const res = await fetch(`/api/internal${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    const message =
      res.status === 401
        ? "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang"
        : res.status === 403
          ? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
          : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
    throw new WebhookApiError(message, res.status, json?.error?.details);
  }
  return { data: json.data as T, meta: json.meta };
}

export interface WebhookPayload {
  merchant_id?: number;
  url: string;
  events: string[];
  retry_count: number;
  retry_intervals: number[];
  timeout_ms: number;
}

export interface ManualSendResult {
  logId: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
}

export const webhookApi = {
  list: async (t: string) => (await call<WebhookConfigView[]>(t, "/webhooks")).data,
  stats: async (t: string, hours = 24) =>
    (await call<WebhookStats>(t, `/webhooks/stats?hours=${hours}`)).data,
  create: async (t: string, body: WebhookPayload) =>
    (
      await call<WebhookConfigView & { secret: string }>(t, "/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ).data,
  update: async (t: string, id: number, body: WebhookPayload) =>
    (
      await call<WebhookConfigView>(t, `/webhooks/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    ).data,
  remove: async (t: string, id: number) =>
    (await call<{ deleted: boolean }>(t, `/webhooks/${id}`, { method: "DELETE" })).data,
  setStatus: async (t: string, id: number, status: "Active" | "Inactive") =>
    (
      await call<WebhookConfigView>(t, `/webhooks/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      })
    ).data,
  rotate: async (t: string, id: number) =>
    (
      await call<WebhookConfigView & { secret: string }>(t, `/webhooks/${id}/rotate-secret`, {
        method: "POST",
      })
    ).data,
  ping: async (t: string, id: number) =>
    (await call<ManualSendResult>(t, `/webhooks/${id}/test`, { method: "POST" })).data,
  logs: (t: string, query: string) => call<WebhookLogView[]>(t, `/webhook-logs?${query}`),
  log: async (t: string, id: string) =>
    (await call<WebhookLogDetail>(t, `/webhook-logs/${id}`)).data,
  replay: async (t: string, id: string) =>
    (await call<ManualSendResult>(t, `/webhook-logs/${id}/replay`, { method: "POST" })).data,
};

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
