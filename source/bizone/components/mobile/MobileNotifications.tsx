"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { useToast } from "@/components/ui/Toast";
import { SeverityDot, eventLabel, timeAgo } from "@/components/notifications/shared";
import { announceUnread, NOTIFICATION_EVENT } from "@/hooks/useNotifications";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { isIos } from "@/lib/pwa/install";
import { mobileLink } from "@/lib/pwa/links";
import { cn } from "@/lib/utils";
import { InstallPrompt } from "./InstallPrompt";
import { Card, DataStatus, Empty, Skeleton } from "./shared";
import { useApiAuth } from "@/components/auth/AuthProvider";

type List = inferRouterOutputs<AppRouter>["notification"]["list"];

/** Notifications on the phone (P6.4): push on this device, install card, latest 30 notifications */
export function MobileNotifications() {
  const auth = useApiAuth();
  const router = useRouter();
  const toast = useToast();
  const q = useOfflineQuery<List>(auth, "notifications", () =>
    trpc.notification.list.query({ page: 1, limit: 30 }, apiContext(auth)),
  );
  const { refresh } = q;

  // new notification on the WebSocket (bell hook in the bottom nav) → reload the list
  useEffect(() => {
    const onNew = () => void refresh();
    window.addEventListener(NOTIFICATION_EVENT, onNew);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNew);
  }, [refresh]);

  async function act(fn: () => Promise<{ unread: number }>) {
    try {
      announceUnread((await fn()).unread);
      void refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const data = q.data;
  return (
    <div>
      <h1 className="mb-3 text-xl font-bold text-slate-900">Thông báo</h1>
      <PushCard auth={auth} />
      <InstallPrompt />

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-600">{data ? `${data.unread} chưa đọc` : ""}</span>
        <button
          type="button"
          disabled={!data?.unread || q.stale}
          onClick={() =>
            act(() => trpc.notification.markAllRead.mutate(undefined, apiContext(auth)))
          }
          className="-mr-2 flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary disabled:text-slate-300"
        >
          <CheckCheck className="h-4 w-4" /> Đọc tất cả
        </button>
      </div>
      <DataStatus {...q} onRefresh={() => void refresh()} />

      {!data && q.loading && <Skeleton rows={4} />}
      {data && data.items.length === 0 && <Empty>Chưa có thông báo</Empty>}
      {data && data.items.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "border-b border-slate-100 last:border-0",
                !n.readAt && "bg-blue-50/50",
              )}
            >
              <button
                type="button"
                className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left"
                onClick={async () => {
                  if (!n.readAt && !q.stale)
                    await act(() =>
                      trpc.notification.markRead.mutate({ ids: [n.id] }, apiContext(auth)),
                    );
                  if (n.link) router.push(mobileLink(n.link));
                }}
              >
                <SeverityDot severity={n.severity} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      n.readAt ? "text-slate-600" : "font-semibold text-slate-900",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.content && <span className="block text-sm text-slate-500">{n.content}</span>}
                  <span className="mt-1 block text-xs text-slate-400">
                    {eventLabel(n.type)}
                    {n.branchName ? ` · ${n.branchName}` : ""} · {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.meta.total > data.items.length && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Hiện {data.items.length}/{data.meta.total} thông báo gần nhất
        </p>
      )}
    </div>
  );
}

/** Web Push on this phone — the reason to install the app on iPhone */
function PushCard({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const push = usePushNotifications(auth);
  const { mode } = useInstallPrompt();
  const ios =
    typeof navigator !== "undefined" && isIos(navigator.userAgent, navigator.maxTouchPoints);

  const text = !push.publicKey
    ? "Máy chủ chưa cấu hình VAPID — thông báo đẩy đang tắt."
    : push.state === "unsupported"
      ? ios && mode !== "installed"
        ? "iPhone chỉ nhận thông báo đẩy khi BizOne được thêm vào màn hình chính (xem hướng dẫn bên dưới)."
        : "Trình duyệt này không hỗ trợ thông báo đẩy."
      : push.state === "denied"
        ? "Bạn đã chặn quyền thông báo — mở cài đặt của trình duyệt / ứng dụng để cho phép lại."
        : push.state === "on"
          ? "Đang bật — nhận đơn mới, cảnh báo tồn kho… cả khi không mở BizOne."
          : "Nhận đơn mới, cảnh báo tồn kho, nhắc công nợ… cả khi không mở BizOne.";

  return (
    <Card className="border-blue-100">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800">
            Thông báo đẩy trên điện thoại này
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{text}</p>
        </div>
      </div>
      {push.publicKey &&
        (push.state === "off" || push.state === "on" || push.state === "loading") && (
          <button
            type="button"
            disabled={push.state === "loading"}
            onClick={async () => {
              try {
                if (push.state === "on") await push.disable();
                else {
                  await push.enable();
                  if (Notification.permission === "granted") toast.success("Đã bật thông báo đẩy");
                }
              } catch (e) {
                toast.error(`Không đổi được thông báo đẩy: ${errorMessage(e)}`);
              }
            }}
            className={cn(
              "mt-3 h-11 w-full rounded-lg text-sm font-semibold disabled:opacity-50",
              push.state === "on"
                ? "border border-slate-200 bg-white text-slate-700"
                : "bg-primary text-white",
            )}
          >
            {push.state === "loading"
              ? "Đang xử lý…"
              : push.state === "on"
                ? "Tắt thông báo đẩy"
                : "Bật thông báo đẩy"}
          </button>
        )}
    </Card>
  );
}
