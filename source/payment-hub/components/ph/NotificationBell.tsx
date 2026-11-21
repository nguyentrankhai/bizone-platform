"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { oidc } from "@/lib/session-client";
import {
  SEVERITY_STYLE,
  notificationApi,
  timeAgo,
  type NotificationView,
} from "./notification-api";

const WS_PROTOCOL = "payhub-events";
const POLL_MS = 30_000;

/**
 * Bell of the admin header (P7.3): unread count + latest notifications, updated in real time by
 * the WebSocket relay (`notification.created`, filtered server-side by audience / merchant), with a
 * 30 s poll as fallback when the socket is down. A short toast shows each new notification.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationView | null>(null);
  const live = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const page = await notificationApi.list({ limit: 8 });
      setItems(page.items);
      setUnread(page.meta.unread);
    } catch {
      // signed out / no permission — the bell stays empty
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => {
      if (!live.current) void refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [refresh]);

  // Realtime
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const token = oidc.currentToken();
      if (!token) {
        retry = setTimeout(connect, 5000);
        return;
      }
      try {
        socket = new WebSocket(wsUrl, [WS_PROTOCOL, token]);
      } catch {
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        live.current = true;
      };
      socket.onmessage = (ev) => {
        let msg: { type?: string; data?: Omit<NotificationView, "read"> };
        try {
          msg = JSON.parse(String(ev.data)) as typeof msg;
        } catch {
          return;
        }
        if (msg.type !== "notification.created" || !msg.data) return;
        const n: NotificationView = { ...msg.data, read: false };
        setItems((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 8));
        setUnread((u) => u + 1);
        setToast(n);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setToast(null), 6000);
      };
      socket.onclose = () => {
        live.current = false;
        if (closed) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      live.current = false;
      if (retry) clearTimeout(retry);
      if (toastTimer) clearTimeout(toastTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function openItem(n: NotificationView) {
    setOpen(false);
    setToast(null);
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void notificationApi.markRead([n.id]).catch(() => {});
    }
    router.push(n.link ?? "/notifications");
  }

  async function readAll() {
    await notificationApi.markRead("all").catch(() => {});
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Thông báo — ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:h-8 md:w-8"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-10 sm:right-0 sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-800">Thông báo</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void readAll()}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu đã đọc
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">Chưa có thông báo</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void openItem(n)}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50",
                    !n.read && "bg-blue-50/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      SEVERITY_STYLE[n.severity]?.dot,
                    )}
                  />
                  <span className="min-w-0">
                    <span className={cn("block text-sm text-gray-800", !n.read && "font-semibold")}>
                      {n.title}
                    </span>
                    {n.message && (
                      <span className="block truncate text-xs text-gray-500">{n.message}</span>
                    )}
                    <span className="block text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-blue-600 hover:bg-gray-50"
          >
            Xem tất cả
          </Link>
        </div>
      )}

      {toast && !open && (
        <div
          role="status"
          className="fixed right-3 bottom-4 left-3 z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:left-auto sm:w-96"
        >
          <button
            type="button"
            onClick={() => void openItem(toast)}
            className="flex gap-3 text-left"
          >
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                SEVERITY_STYLE[toast.severity]?.dot,
              )}
            />
            <span>
              <span className="block text-sm font-semibold text-gray-800">{toast.title}</span>
              {toast.message && (
                <span className="block text-xs text-gray-500">{toast.message}</span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
