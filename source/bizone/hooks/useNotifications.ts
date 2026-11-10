"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, type ApiAuth } from "@/components/inventory/shared";
import {
  NOTIFY_WS_PATH,
  NOTIFY_WS_PROTOCOL,
  type NotificationPayload,
} from "@/lib/notifications/events";

/** Window event other components listen to (the notification page refreshes on it) */
export const NOTIFICATION_EVENT = "bizone:notification";
export const NOTIFICATION_READ_EVENT = "bizone:notification-read";

const POLL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

function wsBase(): string {
  return (
    process.env.NEXT_PUBLIC_POS_WS_URL ??
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3002`
  );
}

export type NotifyMode = "connecting" | "ws" | "poll";

/**
 * Unread badge + live `notification:new` for the top bar. Primary path: WebSocket
 * /ws/notifications of the realtime process (same port as POS). When it is down the hook polls
 * `notification.unreadCount` every 30 s and keeps retrying the socket with backoff.
 */
export function useNotifications(
  auth: ApiAuth | undefined,
  onNew?: (n: NotificationPayload) => void,
) {
  const [unread, setUnread] = useState<number | null>(null);
  const [mode, setMode] = useState<NotifyMode>("connecting");
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  });

  const token = auth?.authToken ?? "";
  const tenantId = auth?.tenantId ?? "";

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await trpc.notification.unreadCount.query(
        undefined,
        apiContext({ authToken: token, tenantId }),
      );
      setUnread(res.unread);
    } catch {
      /* keep the last value */
    }
  }, [token, tenantId]);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      setMode("poll");
      if (!poll) poll = setInterval(refresh, POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(`${wsBase()}${NOTIFY_WS_PATH}?tenant=${encodeURIComponent(tenantId)}`, [
          NOTIFY_WS_PROTOCOL,
          token,
        ]);
      } catch {
        return schedule();
      }
      ws.onopen = () => {
        attempts = 0;
        stopPolling();
        setMode("ws");
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type: string; data: unknown };
          if (msg.type === "notification:unread") {
            setUnread((msg.data as { unread: number }).unread);
          } else if (msg.type === "notification:new") {
            const n = msg.data as NotificationPayload;
            setUnread((u) => (u ?? 0) + 1);
            onNewRef.current?.(n);
            window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: n }));
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        ws = null;
        if (closed) return;
        startPolling();
        void refresh();
        schedule();
      };
    };
    const schedule = () => {
      attempts++;
      retry = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 5)));
    };

    const onRead = (e: Event) => {
      const value = (e as CustomEvent<{ unread: number }>).detail?.unread;
      if (typeof value === "number") setUnread(value);
    };
    window.addEventListener(NOTIFICATION_READ_EVENT, onRead);

    // the socket sends the unread count on connect; a failed connect falls back to polling
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      stopPolling();
      window.removeEventListener(NOTIFICATION_READ_EVENT, onRead);
      ws?.close(1000);
    };
  }, [token, tenantId, refresh]);

  return { unread, mode, refresh, setUnread };
}

/** Tell the bell the new unread count after marking read on another component */
export function announceUnread(unread: number) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { unread } }));
}
