"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { useNotifications } from "@/hooks/useNotifications";
import type { NotificationPayload } from "@/lib/notifications/events";
import { cn } from "@/lib/utils";
import { SeverityDot, timeAgo } from "./shared";

type Item = NotificationPayload & { readAt: Date | string | null };

/** Bell in the top bar: unread badge (WebSocket, poll fallback) + latest notifications */
export function NotificationBell({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { unread, setUnread, mode } = useNotifications(auth, (n) => {
    const kind = n.severity === "error" ? "error" : n.severity === "warning" ? "warning" : "info";
    toast.toast(kind, n.title);
    setItems((list) => (list ? [{ ...n, readAt: null }, ...list].slice(0, 8) : list));
  });

  async function load() {
    try {
      const res = await trpc.notification.list.query({ page: 1, limit: 8 }, apiContext(auth));
      setItems(res.items);
      setUnread(res.unread);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) {
      try {
        const res = await trpc.notification.markRead.mutate({ ids: [n.id] }, apiContext(auth));
        setUnread(res.unread);
        setItems(
          (list) =>
            list?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ??
            null,
        );
      } catch {
        /* navigation still useful */
      }
    }
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    try {
      const res = await trpc.notification.markAllRead.mutate(undefined, apiContext(auth));
      setUnread(res.unread);
      setItems((list) => list?.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })) ?? null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const count = unread ?? 0;
  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-label={count ? `Thông báo (${count} chưa đọc)` : "Thông báo"}
        aria-expanded={open}
        title={mode === "poll" ? "Mất kết nối realtime — đang cập nhật mỗi 30 giây" : undefined}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-14 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Thông báo {count > 0 && <span className="text-slate-400">({count} chưa đọc)</span>}
            </h3>
            {count > 0 && (
              <button
                onClick={readAll}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
            {!items && !error && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Đang tải…</p>
            )}
            {items?.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Chưa có thông báo</p>
            )}
            {items?.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50",
                  !n.readAt && "bg-blue-50/40",
                )}
              >
                <SeverityDot severity={n.severity} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      n.readAt ? "text-slate-600" : "font-medium text-slate-900",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.content && (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {n.content}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-slate-50"
          >
            Xem tất cả
          </Link>
        </div>
      )}
    </div>
  );
}
