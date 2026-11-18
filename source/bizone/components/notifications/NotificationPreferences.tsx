"use client";

import { useState } from "react";
import { BellRing, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, btnSecondary, useLoad } from "@/components/staff/shared";
import { NotificationHeader } from "./shared";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Personal preferences: mute event types in the bell / on push, Web Push on this device */
export function NotificationPreferences({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const prefs = useLoad("prefs", () =>
    trpc.notification.preferences.query(undefined, apiContext(auth)),
  );
  const push = usePushNotifications(auth);
  const pushState = push.state;
  const [draft, setDraft] = useState<Record<string, { inApp: boolean; push: boolean }>>({});
  const [saving, setSaving] = useState(false);

  const rows = (prefs.data ?? []).map((p) => ({ ...p, ...(draft[p.eventType] ?? {}) }));
  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setSaving(true);
    try {
      await trpc.notification.setPreferences.mutate(
        { items: rows.map((r) => ({ eventType: r.eventType, inApp: r.inApp, push: r.push })) },
        apiContext(auth),
      );
      setDraft({});
      prefs.reload();
      toast.success("Đã lưu tuỳ chọn thông báo");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function enablePush() {
    try {
      await push.enable();
      if (Notification.permission === "granted")
        toast.success("Đã bật thông báo đẩy trên thiết bị này");
    } catch (e) {
      toast.error(`Không bật được thông báo đẩy: ${errorMessage(e)}`);
    }
  }

  async function disablePush() {
    try {
      await push.disable();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const pushKey = push.publicKey;
  return (
    <div className="space-y-5">
      <NotificationHeader subtitle="Chọn loại thông báo bạn muốn nhận trên chuông và thông báo đẩy" />
      <ErrorBox message={prefs.error || push.configError} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-800">
              Thông báo đẩy (Web Push) trên thiết bị này
            </h2>
            <p className="text-sm text-slate-500">
              {!pushKey
                ? "Máy chủ chưa cấu hình VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — thông báo đẩy đang tắt."
                : pushState === "unsupported"
                  ? "Trình duyệt này không hỗ trợ thông báo đẩy (iPhone: thêm BizOne vào màn hình chính trước)."
                  : pushState === "denied"
                    ? "Trình duyệt đã chặn quyền thông báo — mở cài đặt trang web để cho phép lại."
                    : pushState === "on"
                      ? "Đang bật — nhận thông báo cả khi không mở BizOne."
                      : "Nhận thông báo cả khi không mở BizOne (đơn mới, nhắc ca…)."}
            </p>
          </div>
          {pushKey && pushState === "off" && (
            <button className={btnPrimary} onClick={enablePush}>
              Bật trên thiết bị này
            </button>
          )}
          {pushKey && pushState === "on" && (
            <button className={btnSecondary} onClick={disablePush}>
              Tắt
            </button>
          )}
        </div>
        {push.devices.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500 uppercase">
              Thiết bị đã bật ({push.devices.length})
            </p>
            <ul className="space-y-1 text-sm text-slate-600">
              {push.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{d.userAgent ?? "Trình duyệt"}</span>
                  <span className="text-xs text-slate-400">
                    {d.lastSuccessAt
                      ? `nhận lần cuối ${new Date(d.lastSuccessAt).toLocaleString("vi-VN")}`
                      : `bật ${new Date(d.createdAt).toLocaleDateString("vi-VN")}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Loại thông báo</th>
              <th className="px-4 py-3 text-center">Chuông</th>
              <th className="px-4 py-3 text-center">Thông báo đẩy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.eventType} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-700">{r.label}</td>
                {(["inApp", "push"] as const).map((k) => (
                  <td key={k} className="px-4 py-1 text-center">
                    <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={r[k]}
                        aria-label={`${r.label} — ${k === "inApp" ? "chuông" : "thông báo đẩy"}`}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [r.eventType]: { inApp: r.inApp, push: r.push, [k]: e.target.checked },
                          }))
                        }
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">
        Chỉ hiện loại thông báo bạn có quyền xem. Kênh email / SMS do quản trị cấu hình ở tab
        &quot;Cấu hình gửi&quot;.
      </p>
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={save} disabled={!dirty || saving}>
          <Save className="h-4 w-4" /> {saving ? "Đang lưu…" : "Lưu tuỳ chọn"}
        </button>
      </div>
    </div>
  );
}
