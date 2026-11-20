import type {
  ConnectorDetail,
  ConnectorView,
  HealthOutcome,
  InstallResult,
} from "@/server/services/connector.service";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for /api/internal/connectors (session token via adminFetch, P6.7). */

export type { ConnectorDetail, ConnectorView, HealthOutcome, InstallResult };

export class ConnectorApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`/api/internal/connectors${path}`, init);
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { message?: string; details?: unknown };
  } | null;
  if (!res.ok || !json?.success) {
    const message =
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại"
        : res.status === 403
          ? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
          : res.status === 429
            ? "Thao tác quá nhanh, thử lại sau ít phút"
            : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
    throw new ConnectorApiError(message, res.status, json?.error?.details);
  }
  return json.data as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const connectorApi = {
  list: () => call<ConnectorView[]>(""),
  get: (code: string) => call<ConnectorDetail>(`/${encodeURIComponent(code)}`),
  upload: (file: File) =>
    call<InstallResult>("", {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: file,
    }),
  setActive: (code: string, active: boolean) =>
    call<ConnectorView>(`/${encodeURIComponent(code)}/status`, {
      method: "PUT",
      ...json({ active }),
    }),
  health: (code: string) =>
    call<HealthOutcome>(`/${encodeURIComponent(code)}/health`, { method: "POST" }),
  remove: (code: string) =>
    call<{ removed: true }>(`/${encodeURIComponent(code)}`, { method: "DELETE" }),
};

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Error details of the API (list of issues) as lines. */
export function detailLines(details: unknown): string[] {
  if (Array.isArray(details)) return details.map(String).slice(0, 20);
  return [];
}
