"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCheck, Mail, MailOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnSecondary, useLoad } from "@/components/staff/shared";
import { announceUnread, NOTIFICATION_EVENT } from "@/hooks/useNotifications";
import { EVENT_TYPES, NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import { cn } from "@/lib/utils";
import { NotificationHeader, SeverityDot, eventLabel, timeAgo } from "./shared";

/** Notification Center (SRS §9): every notification of the last 30 days, read / unread */
export function NotificationCenter({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<string>("");
  const input = { page, limit: 20, unreadOnly, ...(type ? { type } : {}) };
  const list = useLoad(JSON.stringify(input), () =>
    trpc.notification.list.query(input, apiContext(auth)),
  );
  const { reload } = list;

  // A new notification arrived on the WebSocket (bell) → refresh the first page
  useEffect(() => {
    const onNew = () => page === 1 && reload();
    window.addEventListener(NOTIFICATION_EVENT, onNew);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNew);
  }, [page, reload]);

  async function act(fn: () => Promise<{ unread: number }>) {
    try {
      const res = await fn();
      announceUnread(res.unread);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const data = list.data;
  return (
    <div className="space-y-5">
      <NotificationHeader subtitle="Thông báo hệ thống trong 30 ngày gần nhất — đơn mới, tồn kho, công nợ, ca làm việc…" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {[
            [false, "Tất cả"],
            [true, "Chưa đọc"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              onClick={() => {
                setUnreadOnly(v as boolean);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5",
                unreadOnly === v ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          aria-label="Loại thông báo"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Mọi loại</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {NOTIFICATION_EVENTS[t].label}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{data ? `${data.unread} chưa đọc` : ""}</span>
        <button
          onClick={() =>
            act(() => trpc.notification.markAllRead.mutate(undefined, apiContext(auth)))
          }
          disabled={!data?.unread}
          className={cn(btnSecondary, "ml-auto")}
        >
          <CheckCheck className="h-4 w-4" /> Đánh dấu tất cả đã đọc
        </button>
      </div>

      <ErrorBox message={list.error} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {list.loading && !data && (
          <p className="p-6 text-center text-sm text-slate-400">Đang tải…</p>
        )}
        {data?.items.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-400">
            {unreadOnly ? "Không còn thông báo chưa đọc" : "Chưa có thông báo"}
          </p>
        )}
        <ul>
          {data?.items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0",
                !n.readAt && "bg-blue-50/40",
              )}
            >
              <SeverityDot severity={n.severity} className="mt-2" />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={async () => {
                  if (!n.readAt)
                    await act(() =>
                      trpc.notification.markRead.mutate({ ids: [n.id] }, apiContext(auth)),
                    );
                  if (n.link) router.push(n.link);
                }}
              >
                <span
                  className={cn(
                    "block text-sm",
                    n.readAt ? "text-slate-600" : "font-semibold text-slate-900",
                  )}
                >
                  {n.title}
                </span>
                {n.content && <span className="block text-sm text-slate-500">{n.content}</span>}
                <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                  <span>{eventLabel(n.type)}</span>
                  {n.branchName && <span>{n.branchName}</span>}
                  <span title={new Date(n.createdAt).toLocaleString("vi-VN")}>
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
              <button
                onClick={() =>
                  act(() =>
                    n.readAt
                      ? trpc.notification.markUnread.mutate({ ids: [n.id] }, apiContext(auth))
                      : trpc.notification.markRead.mutate({ ids: [n.id] }, apiContext(auth)),
                  )
                }
                title={n.readAt ? "Đánh dấu chưa đọc" : "Đánh dấu đã đọc"}
                aria-label={n.readAt ? "Đánh dấu chưa đọc" : "Đánh dấu đã đọc"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                {n.readAt ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-slate-500">
            Trang {data.meta.page}/{data.meta.totalPages} · {data.meta.total} thông báo
          </span>
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <button
            className={btnSecondary}
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
