import type { SystemLogRow, TransactionLogRow } from "@/server/services/audit.service";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for /api/internal/audit-logs (P7.2). */

export type { SystemLogRow, TransactionLogRow };
export type AuditKind = "system" | "transaction";

export interface AuditQuery {
  kind: AuditKind;
  from: string;
  to: string;
  action?: string;
  user?: string;
  entity_type?: string;
  entity_id?: string;
  result?: string;
  q?: string;
  page?: number;
}

export interface Page<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SystemLogDetail extends SystemLogRow {
  userAgent: string | null;
  oldData: unknown;
  newData: unknown;
}

export interface TransactionLogDetail extends TransactionLogRow {
  rawData: unknown;
  exchanges: {
    id: string;
    createdAt: string;
    direction: string;
    source: string;
    endpoint: string | null;
    httpStatus: number | null;
    headers: unknown;
    body: unknown;
  }[];
}

export class AuditApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function messageOf(res: Response, json: { error?: { message?: string } } | null): string {
  if (res.status === 401) return "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại";
  if (res.status === 403) return "Chỉ quản trị viên (payhub-admin) xem được nhật ký";
  if (res.status === 429) return "Thao tác quá nhanh, thử lại sau ít phút";
  return json?.error?.message ?? `Lỗi HTTP ${res.status}`;
}

function qs(query: AuditQuery, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...extra })) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

async function call<T>(path: string): Promise<{ data: T; meta?: Page<unknown>["meta"] }> {
  const res = await adminFetch(`/api/internal/audit-logs${path}`, {});
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    meta?: Page<unknown>["meta"];
    error?: { message?: string };
  } | null;
  if (!res.ok || !json?.success) throw new AuditApiError(messageOf(res, json), res.status);
  return { data: json.data as T, meta: json.meta };
}

export const auditApi = {
  async list<T>(query: AuditQuery): Promise<Page<T>> {
    const r = await call<T[]>(`?${qs(query)}`);
    return { items: r.data, meta: r.meta! };
  },
  async get<T>(kind: AuditKind, id: string): Promise<T> {
    return (await call<T>(`/${encodeURIComponent(id)}?kind=${kind}`)).data;
  },
  async options() {
    return (await call<{ actions: string[]; entityTypes: string[]; events: string[] }>("/options"))
      .data;
  },
  async download(query: AuditQuery, format: "csv" | "xlsx"): Promise<void> {
    const res = await adminFetch(`/api/internal/audit-logs/export?${qs(query, { format })}`, {});
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new AuditApiError(messageOf(res, json), res.status);
    }
    const name =
      /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
      `audit.${format}`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Today in Vietnam (YYYY-MM-DD) and N days before. */
export function vnDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Đăng nhập",
  "auth.logout": "Đăng xuất",
  "partner.create": "Thêm đối tác",
  "partner.update": "Sửa đối tác",
  "partner.status": "Bật / tắt đối tác",
  "partner.test": "Test kết nối đối tác",
  "connector.upload": "Tải lên connector",
  "connector.status": "Bật / tắt connector",
  "connector.remove": "Gỡ connector",
  "connector.health_check": "Kiểm tra connector",
  "webhook.create": "Thêm webhook",
  "webhook.update": "Sửa webhook",
  "webhook.delete": "Xoá webhook",
  "webhook.status": "Bật / tắt webhook",
  "webhook.rotate_secret": "Đổi secret webhook",
  "webhook.test": "Gửi thử webhook",
  "webhook.replay": "Gửi lại webhook",
  "route.update": "Sửa định tuyến merchant",
  "route.reset_circuit": "Đóng circuit breaker",
  "refund.create": "Hoàn tiền (thủ công)",
  "refund.check": "Hỏi lại hoàn tiền",
  "refund.resolve": "Xác nhận hoàn tiền",
  "recon.run": "Chạy đối soát",
  "recon.import": "Nhập sao kê đối soát",
  "recon.resolve_detail": "Xử lý dòng đối soát",
  "dispute.create": "Tạo tra soát",
  "dispute.update": "Cập nhật tra soát",
  "dispute.submit": "Gửi tra soát",
  "dispute.check": "Hỏi kết quả tra soát",
  "dispute.attachment_add": "Thêm chứng từ tra soát",
  "dispute.attachment_remove": "Xoá chứng từ tra soát",
  "apikey.create": "Cấp API key",
  "audit.export": "Xuất nhật ký",
};
