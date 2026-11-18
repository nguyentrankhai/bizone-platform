import type { PartnerLogView, PartnerView, TestResult } from "@/lib/partner-types";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for /api/internal/partners (session token via adminFetch, P6.7). */

export class ApiCallError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`/api/internal/partners${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
        ? "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại"
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
  dispute_email: string;
}

export const partnerApi = {
  list: (query = "") => call<PartnerView[]>(query ? `?${query}` : ""),
  create: (body: PartnerPayload) =>
    call<PartnerView>("", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: PartnerPayload) =>
    call<PartnerView>(`/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  test: (id: number) =>
    call<{ test_result: TestResult; last_tested_at: string; partner: PartnerView }>(`/${id}/test`, {
      method: "POST",
    }),
  setStatus: (id: number, status: "Active" | "Inactive") =>
    call<PartnerView>(`/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  logs: (id: number, page = 1) =>
    call<{ items: PartnerLogView[]; total: number; page: number; totalPages: number }>(
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
