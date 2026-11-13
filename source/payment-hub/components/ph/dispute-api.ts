import type { DisputeAttachmentView, DisputeDetail, DisputeView } from "@/lib/dispute";

/** Client helpers for the admin dispute API (/api/internal/disputes…, Bearer token). P5.6 */

export class DisputeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export interface SubmitReport {
  channel: "Api" | "Email" | "Manual";
  ok: boolean;
  message: string;
  provider?: string;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: unknown;
  submit?: SubmitReport | null;
  submitError?: string | null;
  error?: { code?: string; message?: string };
}

function messageFor(status: number, json: Envelope<unknown> | null): string {
  if (status === 401)
    return "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)";
  if (status === 413) return json?.error?.message ?? "Tệp quá lớn";
  return json?.error?.message ?? `Lỗi HTTP ${status}`;
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Envelope<T> & { data: T }> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api/internal${path}`, {
    ...init,
    headers: {
      ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (res.ok && json?.success && json.data !== undefined) return json as Envelope<T> & { data: T };
  throw new DisputeApiError(messageFor(res.status, json), res.status, json?.error?.code);
}

export interface DisputeListMeta {
  page: number;
  limit: number;
  total: number;
  counts: Record<string, number>;
}

export const disputeApi = {
  list: async (token: string, query: string) => {
    const r = await call<DisputeView[]>(token, `/disputes${query ? `?${query}` : ""}`);
    return { items: r.data, meta: r.meta as DisputeListMeta };
  },
  get: async (token: string, id: number) =>
    (await call<DisputeDetail>(token, `/disputes/${id}`)).data,
  create: async (
    token: string,
    body: { transaction_id: number; reason: string; description?: string; submit?: boolean },
  ) => {
    const r = await call<DisputeDetail>(token, "/disputes", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { dispute: r.data, submit: r.submit ?? null, submitError: r.submitError ?? null };
  },
  upload: async (token: string, id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return (
      await call<DisputeAttachmentView>(token, `/disputes/${id}/attachments`, {
        method: "POST",
        body: form,
      })
    ).data;
  },
  removeAttachment: (token: string, id: number, attachmentId: number) =>
    call<{ deleted: boolean }>(token, `/disputes/${id}/attachments/${attachmentId}`, {
      method: "DELETE",
    }),
  submit: async (
    token: string,
    id: number,
    body: { mode: "auto" | "manual"; partner_ref?: string; note?: string },
  ) => {
    const r = await call<DisputeDetail>(token, `/disputes/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { dispute: r.data, submit: r.submit ?? null };
  },
  update: async (
    token: string,
    id: number,
    body: {
      status: "Processing" | "Resolved" | "Rejected";
      resolution?: string;
      note?: string;
      from_partner?: boolean;
      partner_ref?: string;
    },
  ) =>
    (
      await call<DisputeDetail>(token, `/disputes/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    ).data,
  check: async (token: string, id: number) =>
    (await call<DisputeDetail>(token, `/disputes/${id}/check`, { method: "POST" })).data,
  /** Fetch with the token, then save via an object URL (a plain link cannot send the header). */
  download: async (token: string, id: number, attachmentId: number, fileName: string) => {
    const res = await fetch(`/api/internal/disputes/${id}/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
      throw new DisputeApiError(messageFor(res.status, json), res.status, json?.error?.code);
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
