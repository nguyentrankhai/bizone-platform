"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Bell, CheckCheck, Loader2, Save, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTIFICATION_EVENTS } from "@/services/notification/events";
import {
  NotificationApiError,
  SEVERITY_STYLE,
  notificationApi,
  timeAgo,
  type NotificationPage,
  type NotificationView,
  type SettingRow,
  type SettingsView,
} from "./notification-api";

interface NotificationCenterProps {
  initial: NotificationPage;
  settings: SettingsView | null;
}

const input =
  "h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none sm:h-9";

/**
 * /notifications (P7.3): history (30 days), unread / event / severity filters, mark read; for
 * payhub-admin also the per-event channels (in-app / e-mail), thresholds and recipients.
 */
export function NotificationCenter({ initial, settings }: NotificationCenterProps) {
  const [tab, setTab] = useState<"list" | "settings">("list");
  const [page, setPage] = useState(initial);
  const [filter, setFilter] = useState({ unread: false, event: "", severity: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: typeof filter, p = 1) => {
    setLoading(true);
    setError(null);
    try {
      setPage(await notificationApi.list({ ...f, page: p }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được thông báo");
    } finally {
      setLoading(false);
    }
  }, []);

  function change(next: Partial<typeof filter>) {
    const f = { ...filter, ...next };
    setFilter(f);
    void load(f);
  }

  async function read(n: NotificationView) {
    if (n.read) return;
    await notificationApi.markRead([n.id]).catch(() => {});
    setPage((p) => ({
      ...p,
      items: p.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      meta: { ...p.meta, unread: Math.max(0, p.meta.unread - 1) },
    }));
  }

  async function readAll() {
    await notificationApi.markRead("all").catch(() => {});
    void load(filter, page.meta.page);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <Bell className="h-5 w-5 text-blue-600" /> Thông báo
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {page.meta.unread} chưa đọc · lưu 30 ngày · cập nhật thời gian thực
          </p>
        </div>
        {settings && (
          <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(
              [
                ["list", "Danh sách", Bell],
                ["settings", "Cấu hình", Settings2],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                  tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "settings" && settings ? (
        <SettingsPanel initial={settings} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm sm:h-9">
              <input
                type="checkbox"
                checked={filter.unread}
                onChange={(e) => change({ unread: e.target.checked })}
              />
              Chỉ chưa đọc
            </label>
            <select
              aria-label="Loại thông báo"
              className={input}
              value={filter.event}
              onChange={(e) => change({ event: e.target.value })}
            >
              <option value="">Mọi loại</option>
              {Object.entries(NOTIFICATION_EVENTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Mức độ"
              className={input}
              value={filter.severity}
              onChange={(e) => change({ severity: e.target.value })}
            >
              <option value="">Mọi mức độ</option>
              {Object.entries(SEVERITY_STYLE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void readAll()}
              disabled={page.meta.unread === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:ml-auto sm:h-9"
            >
              <CheckCheck className="h-4 w-4" /> Đánh dấu tất cả đã đọc
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <ul
            className={cn(
              "divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
              loading && "opacity-60",
            )}
          >
            {page.items.length === 0 && (
              <li className="p-10 text-center text-sm text-gray-500">Không có thông báo.</li>
            )}
            {page.items.map((n) => {
              const sev = SEVERITY_STYLE[n.severity];
              const label = (NOTIFICATION_EVENTS as Record<string, { label: string }>)[n.event]
                ?.label;
              return (
                <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-blue-50/40")}>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", sev?.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className={cn("text-sm text-gray-800", !n.read && "font-semibold")}>
                        {n.title}
                      </p>
                      <span className="text-xs whitespace-nowrap text-gray-400">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-sm break-words whitespace-pre-line text-gray-600">
                        {n.message}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <span className={cn("font-medium", sev?.text)}>{label ?? n.event}</span>
                      {n.link && (
                        <Link
                          href={n.link}
                          onClick={() => void read(n)}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Xem chi tiết
                        </Link>
                      )}
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => void read(n)}
                          className="text-gray-500 hover:text-gray-800"
                        >
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {page.meta.total} thông báo · trang {page.meta.page}/{page.meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || page.meta.page <= 1}
                onClick={() => void load(filter, page.meta.page - 1)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-40 sm:h-9"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={loading || page.meta.page >= page.meta.totalPages}
                onClick={() => void load(filter, page.meta.page + 1)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-40 sm:h-9"
              >
                Sau
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsPanel({ initial }: { initial: SettingsView }) {
  const [rows, setRows] = useState<SettingRow[]>(initial.events);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set(event: string, patch: Partial<SettingRow>) {
    setRows((list) => list.map((r) => (r.event === event ? { ...r, ...patch } : r)));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await notificationApi.saveSettings(
        rows.map((r) => ({
          event: r.event,
          inApp: r.inApp,
          email: r.email,
          threshold: r.threshold,
          windowMinutes: r.windowMinutes,
          emailTo: r.emailTo,
        })),
      );
      setRows(res.events);
      setMsg({ ok: true, text: "Đã lưu — áp dụng trong vòng 10 giây" });
    } catch (e) {
      const details =
        e instanceof NotificationApiError && e.details && typeof e.details === "object"
          ? Object.values(e.details as Record<string, string>).join("; ")
          : "";
      setMsg({
        ok: false,
        text: `${e instanceof Error ? e.message : "Lưu thất bại"}${details ? `: ${details}` : ""}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Email gửi qua{" "}
        {initial.smtp === "smtp" ? "SMTP" : <b>chế độ ghi log (chưa cấu hình SMTP)</b>}; người nhận
        mặc định:{" "}
        {initial.defaultEmailTo.length
          ? initial.defaultEmailTo.join(", ")
          : "chưa có (NOTIFY_EMAILS)"}
        .
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <section
            key={r.event}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-800">{r.label}</h3>
                <p className="text-xs text-gray-500">{r.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                {r.audience === "admin" ? "Chỉ admin" : "Mọi người dùng"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={r.inApp}
                  onChange={(e) => set(r.event, { inApp: e.target.checked })}
                />
                Trong ứng dụng
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={r.email}
                  onChange={(e) => set(r.event, { email: e.target.checked })}
                />
                Email
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {r.threshold !== null && (
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                  {r.thresholdLabel ?? "Ngưỡng"}
                  <input
                    type="number"
                    min={1}
                    className={input}
                    value={r.threshold}
                    onChange={(e) =>
                      set(r.event, { threshold: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </label>
              )}
              {r.windowMinutes !== null && (
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                  {r.windowLabel ?? "Khoảng thời gian (phút)"}
                  <input
                    type="number"
                    min={1}
                    className={input}
                    value={r.windowMinutes}
                    onChange={(e) =>
                      set(r.event, { windowMinutes: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </label>
              )}
              {r.email && (
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 sm:col-span-2">
                  Người nhận email (trống = mặc định)
                  <input
                    className={input}
                    value={r.emailTo}
                    placeholder={initial.defaultEmailTo.join(", ") || "ops@congty.vn"}
                    onChange={(e) => set(r.event, { emailTo: e.target.value })}
                  />
                </label>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:h-9"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu cấu hình
        </button>
        {msg && (
          <span
            role="status"
            className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
