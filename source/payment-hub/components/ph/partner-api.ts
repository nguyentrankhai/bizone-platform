import type { PartnerLogView, PartnerView, TestResult } from "@/lib/partner-types";

/** Client helpers for /api/internal/partners (Bearer token: dev DEV_AUTH_TOKEN, see issue #7). */

export class ApiCallError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/internal/partners${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { message?: string; details?: Record<string, string[]> };
  } | null;
  if (!res.ok || !json?.success) {
    const message =
      res.status === 401
        ? "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang"
        : res.status === 403
          ? "Bạn không có quyền thực hiện thao tác này (cần role payhub-admin)"
          : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
    throw new ApiCallError(message, res.status, json?.error?.details);
  }
  return json.data as T;
}

export interface PartnerPayload {
  connector_type: string;
  name: string;
  merchant_code: string;
  environment: string;
  api_key?: string;
  secret_key?: string;
  endpoint_sandbox: string;
  endpoint_production: string;
  callback_url: string;
  webhook_url: string;
  timeout: number;
  retry_policy: { max_retries: number; backoff_ms: number };
  fee_percent: number;
  fee_fixed: number;
}

export const partnerApi = {
  list: (token: string, query = "") => call<PartnerView[]>(token, query ? `?${query}` : ""),
  create: (token: string, body: PartnerPayload) =>
    call<PartnerView>(token, "", { method: "POST", body: JSON.stringify(body) }),
  update: (token: string, id: number, body: PartnerPayload) =>
    call<PartnerView>(token, `/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  test: (token: string, id: number) =>
    call<{ test_result: TestResult; last_tested_at: string; partner: PartnerView }>(
      token,
      `/${id}/test`,
      { method: "POST" },
    ),
  setStatus: (token: string, id: number, status: "Active" | "Inactive") =>
    call<PartnerView>(token, `/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  logs: (token: string, id: number, page = 1) =>
    call<{ items: PartnerLogView[]; total: number; page: number; totalPages: number }>(
      token,
      `/${id}/logs?page=${page}`,
    ),
};

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
