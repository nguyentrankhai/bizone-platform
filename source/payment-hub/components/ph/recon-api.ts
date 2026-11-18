import type { DetailView, RunView } from "@/server/services/reconciliation.service";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for /api/internal/reconciliation (session token via adminFetch). Types only from the service. */

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
  if (res.status === 401) return "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại";
  if (res.status === 403)
    return (
      json?.error?.message ?? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
    );
  return json?.error?.message ?? `Lỗi HTTP ${res.status}`;
}

async function call<T>(path: string, init?: RequestInit) {
  const res = await adminFetch(`/api/internal/reconciliation${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) throw new ReconApiError(messageOf(res, json), res.status);
  return { data: json.data as T, meta: json.meta };
}

export const reconApi = {
  runs: (q: URLSearchParams) => call<RunView[]>(`?${q.toString()}`),
  run: (id: number) => call<RunView>(`/${id}`),
  details: (id: number, q: URLSearchParams) => call<DetailView[]>(`/${id}/details?${q.toString()}`),
  start: (body: { partner_config_id: number; run_date: string }) =>
    call<RunView>("", { method: "POST", body: JSON.stringify(body) }),
  importFile: (form: FormData) =>
    call<RunView & { skipped: { row: number; reason: string }[] }>("/import", {
      method: "POST",
      body: form,
    }),
  resolve: (
    runId: number,
    detailId: string,
    body: { status: "Open" | "Resolved"; resolution?: string },
  ) =>
    call<DetailView>(`/${runId}/details/${detailId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /** Download the report through fetch (the API needs the Authorization header). */
  async download(id: number, format: "xlsx" | "pdf"): Promise<void> {
    const res = await adminFetch(`/api/internal/reconciliation/${id}/export?format=${format}`, {});
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
