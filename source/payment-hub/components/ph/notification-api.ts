import type { NotificationView } from "@/server/services/notification.service";
import { adminFetch } from "@/lib/session-client";

/** Client helpers for /api/internal/notifications (P7.3). */

export type { NotificationView };

export interface NotificationPage {
  items: NotificationView[];
  meta: { page: number; limit: number; total: number; totalPages: number; unread: number };
}

export interface SettingRow {
  event: string;
  label: string;
  description: string;
  severity: string;
  audience: "all" | "admin";
  inApp: boolean;
  email: boolean;
  threshold: number | null;
  thresholdLabel: string | null;
  windowMinutes: number | null;
  windowLabel: string | null;
  emailTo: string;
  customized: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface SettingsView {
  defaultEmailTo: string[];
  smtp: "smtp" | "log";
  events: SettingRow[];
}

export class NotificationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: NotificationPage["meta"] }> {
  const res = await adminFetch(`/api/internal/notifications${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    meta?: NotificationPage["meta"];
    error?: { message?: string; details?: unknown };
  } | null;
  if (!res.ok || !json?.success) {
    const message =
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn"
        : res.status === 403
          ? "Bạn không có quyền thực hiện thao tác này"
          : (json?.error?.message ?? `Lỗi HTTP ${res.status}`);
    throw new NotificationApiError(message, res.status, json?.error?.details);
  }
  return { data: json.data as T, meta: json.meta };
}

export const notificationApi = {
  async list(q: {
    unread?: boolean;
    event?: string;
    severity?: string;
    page?: number;
    limit?: number;
  }) {
    const p = new URLSearchParams();
    if (q.unread) p.set("unread", "1");
    if (q.event) p.set("event", q.event);
    if (q.severity) p.set("severity", q.severity);
    p.set("page", String(q.page ?? 1));
    p.set("limit", String(q.limit ?? 20));
    const r = await call<NotificationView[]>(`?${p.toString()}`);
    return { items: r.data, meta: r.meta! } satisfies NotificationPage;
  },
  async markRead(ids: string[] | "all") {
    return (
      await call<{ marked: number }>("/read", {
        method: "POST",
        body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
      })
    ).data;
  },
  async settings() {
    return (await call<SettingsView>("/settings")).data;
  },
  async saveSettings(events: Partial<SettingRow>[]) {
    return (
      await call<SettingsView>("/settings", { method: "PUT", body: JSON.stringify({ events }) })
    ).data;
  },
};

export const SEVERITY_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  Success: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Thành công" },
  Warning: { dot: "bg-amber-500", text: "text-amber-700", label: "Cảnh báo" },
  Error: { dot: "bg-red-500", text: "text-red-700", label: "Lỗi" },
  Info: { dot: "bg-blue-500", text: "text-blue-700", label: "Thông tin" },
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
