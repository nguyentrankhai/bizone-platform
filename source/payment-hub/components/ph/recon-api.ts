import type { DetailView, RunView } from "@/server/services/reconciliation.service";

/** Client helpers for /api/internal/reconciliation (Bearer token). Types only from the service. */

export type { DetailView, RunView };

export interface ReconPartner {
  id: number;
  name: string;
  connector_type: string;
  status: string;
  environment: string;
  api: boolean;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class ReconApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: PageMeta;
  error?: { message?: string; details?: unknown };
}

function messageOf(res: Response, json: Envelope<unknown> | null): string {
  if (res.status === 401)
    return "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang";
  if (res.status === 403)
    return (
      json?.error?.message ?? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
    );
  return json?.error?.message ?? `Lỗi HTTP ${res.status}`;
}

async function call<T>(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`/api/internal/reconciliation${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) throw new ReconApiError(messageOf(res, json), res.status);
  return { data: json.data as T, meta: json.meta };
}

export const reconApi = {
  runs: (token: string, q: URLSearchParams) => call<RunView[]>(token, `?${q.toString()}`),
  run: (token: string, id: number) => call<RunView>(token, `/${id}`),
  details: (token: string, id: number, q: URLSearchParams) =>
    call<DetailView[]>(token, `/${id}/details?${q.toString()}`),
  start: (token: string, body: { partner_config_id: number; run_date: string }) =>
    call<RunView>(token, "", { method: "POST", body: JSON.stringify(body) }),
  importFile: (token: string, form: FormData) =>
    call<RunView & { skipped: { row: number; reason: string }[] }>(token, "/import", {
      method: "POST",
      body: form,
    }),
  resolve: (
    token: string,
    runId: number,
    detailId: string,
    body: { status: "Open" | "Resolved"; resolution?: string },
  ) =>
    call<DetailView>(token, `/${runId}/details/${detailId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /** Download the report through fetch (the API needs the Authorization header). */
  async download(token: string, id: number, format: "xlsx" | "pdf"): Promise<void> {
    const res = await fetch(`/api/internal/reconciliation/${id}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
      throw new ReconApiError(messageOf(res, json), res.status);
    }
    const name =
      /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
      `doi-soat-${id}.${format}`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
