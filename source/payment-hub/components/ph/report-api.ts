import type { ReportFormat, ReportType, RevenueReport, TxnReport } from "@/lib/report";
import type {
  ReconDiscrepancyRow,
  ReconciliationReport,
  ReportOptions,
} from "@/server/services/report.service";

/** Client helpers for /api/internal/reports (Bearer token). Types only from the service. */

export type { ReconDiscrepancyRow, ReconciliationReport, ReportOptions };

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: PageMeta;
  error?: { message?: string };
}

export class ReportApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function messageOf(res: Response, json: Envelope<unknown> | null): string {
  if (res.status === 401)
    return "Phiên đăng nhập hết hạn (DEV_AUTH_TOKEN) — lấy token mới rồi tải lại trang";
  if (res.status === 403) return json?.error?.message ?? "Bạn không có quyền xem báo cáo này";
  return json?.error?.message ?? `Lỗi HTTP ${res.status}`;
}

function headers(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(token: string, path: string, q: URLSearchParams) {
  const res = await fetch(`/api/internal/reports/${path}?${q.toString()}`, {
    headers: headers(token),
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) throw new ReportApiError(messageOf(res, json), res.status);
  return { data: json.data as T, meta: json.meta };
}

export const reportApi = {
  transactions: (token: string, q: URLSearchParams) => get<TxnReport>(token, "transactions", q),
  revenue: (token: string, q: URLSearchParams) => get<RevenueReport>(token, "revenue", q),
  reconciliation: (token: string, q: URLSearchParams) =>
    get<ReconciliationReport>(token, "reconciliation", q),
  discrepancies: (token: string, q: URLSearchParams) =>
    get<ReconDiscrepancyRow[]>(token, "reconciliation/discrepancies", q),

  /** Download through fetch (the API needs the Authorization header). */
  async download(
    token: string,
    type: ReportType,
    format: ReportFormat,
    filters: URLSearchParams,
  ): Promise<void> {
    const q = new URLSearchParams(filters);
    q.set("type", type);
    q.set("format", format);
    const res = await fetch(`/api/internal/reports/export?${q.toString()}`, {
      headers: headers(token),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
      throw new ReportApiError(messageOf(res, json), res.status);
    }
    const name =
      /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
      `bao-cao.${format}`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
