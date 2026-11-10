"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, inputCls, useLoad } from "@/components/staff/shared";
import type { NotificationEventDef } from "@/lib/notifications/events";
import { cn } from "@/lib/utils";
import { NotificationHeader } from "./shared";

type Settings = RouterOutputs["notification"]["settings"];
type Setting = Settings["settings"][number];
type Template = RouterOutputs["notification"]["templates"][number];

const PROVIDER_TEXT: Record<string, string> = {
  smtp: "SMTP",
  log: "ghi log (dev — chưa cấu hình)",
  http: "SMS gateway HTTP",
  webpush: "VAPID",
  off: "tắt (chưa cấu hình VAPID)",
};

/** Store-level channels per event type (config:write) — SRS §9 */
export function NotificationSettings({ auth }: { auth: ApiAuth }) {
  const data = useLoad("settings", () =>
    Promise.all([
      trpc.notification.settings.query(undefined, apiContext(auth)),
      trpc.notification.templates.query(undefined, apiContext(auth)),
    ]),
  );
  const [settings, templates] = data.data ?? [];

  return (
    <div className="space-y-5">
      <NotificationHeader subtitle="Kênh gửi, người nhận và mẫu nội dung cho từng loại thông báo của cửa hàng" />
      <ErrorBox message={data.error} />
      {settings && (
        <div className="flex flex-wrap gap-2 text-xs">
          {(
            [
              ["Email", settings.providers.email],
              ["SMS", settings.providers.sms],
              ["Web Push", settings.providers.push],
            ] as const
          ).map(([label, p]) => (
            <span
              key={label}
              className={cn(
                "rounded-full px-3 py-1",
                p === "log" || p === "off"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {label}: {PROVIDER_TEXT[p] ?? p}
            </span>
          ))}
        </div>
      )}
      {settings && templates && (
        <div className="space-y-4">
          {settings.settings.map((s) => (
            <EventCard
              key={s.eventType}
              auth={auth}
              def={(settings.events as Record<string, NotificationEventDef>)[s.eventType]}
              setting={s}
              templates={templates}
              onSaved={data.reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  auth,
  def,
  setting,
  templates,
  onSaved,
}: {
  auth: ApiAuth;
  def: NotificationEventDef;
  setting: Setting;
  templates: Template[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [s, setS] = useState({
    ...setting,
    emailToText: setting.emailTo.join(", "),
    smsToText: setting.smsTo.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const personal = def.audience === null;
  const set = (patch: Partial<typeof s>) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const split = (t: string) =>
    t
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

  async function save() {
    setSaving(true);
    try {
      await trpc.notification.updateSetting.mutate(
        {
          eventType: s.eventType,
          inApp: s.inApp,
          email: s.email,
          sms: s.sms,
          push: s.push,
          emailTo: personal ? [] : split(s.emailToText),
          smsTo: personal ? [] : split(s.smsToText),
          emailTemplate: s.emailTemplate,
          smsTemplate: s.smsTemplate,
          options: s.options,
        },
        apiContext(auth),
      );
      setDirty(false);
      toast.success(`Đã lưu "${def.label}"`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const channels = [
    ["inApp", "Trong app"],
    ["push", "Web Push"],
    ["email", "Email"],
    ["sms", "SMS"],
  ] as const;
  const id = `ev-${s.eventType}`;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      aria-labelledby={id}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-semibold text-slate-800">
            {def.label}
            {def.pending && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
                {def.pending}
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500">
            {def.description}
            {personal ? " · gửi tới chính nhân viên đó (email / SĐT trong hồ sơ)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {channels.map(([k, label]) => (
            <label
              key={k}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm",
                s[k] ? "border-primary bg-blue-50 text-primary" : "border-slate-200 text-slate-600",
                k === "sms" && !def.smsTemplate && "hidden",
              )}
            >
              <input
                type="checkbox"
                checked={s[k]}
                onChange={(e) => set({ [k]: e.target.checked } as Partial<typeof s>)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {(s.email || s.sms || def.options.length > 0) && (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
          {s.email && (
            <>
              {!personal && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700">
                    Email nhận (cách nhau dấu phẩy)
                  </span>
                  <input
                    className={inputCls}
                    value={s.emailToText}
                    placeholder="quanly@cuahang.vn"
                    onChange={(e) => set({ emailToText: e.target.value })}
                  />
                </label>
              )}
              <TemplateSelect
                label="Mẫu email"
                channel="email"
                value={s.emailTemplate}
                templates={templates}
                onChange={(v) => set({ emailTemplate: v })}
              />
            </>
          )}
          {s.sms && (
            <>
              {!personal && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700">
                    SĐT nhận SMS (cách nhau dấu phẩy)
                  </span>
                  <input
                    className={inputCls}
                    value={s.smsToText}
                    placeholder="0901234567"
                    onChange={(e) => set({ smsToText: e.target.value })}
                  />
                </label>
              )}
              <TemplateSelect
                label="Mẫu SMS"
                channel="sms"
                value={s.smsTemplate}
                templates={templates}
                onChange={(v) => set({ smsTemplate: v })}
              />
            </>
          )}
          {def.options.map((o) => (
            <label key={o.key} className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">{o.label}</span>
              {o.kind === "number" && (
                <input
                  type="number"
                  className={inputCls}
                  min={o.min}
                  max={o.max}
                  value={Number(s.options[o.key] ?? o.default)}
                  onChange={(e) =>
                    set({ options: { ...s.options, [o.key]: Number(e.target.value) } })
                  }
                />
              )}
              {o.kind === "select" && (
                <select
                  className={inputCls}
                  value={String(s.options[o.key] ?? o.default)}
                  onChange={(e) => set({ options: { ...s.options, [o.key]: e.target.value } })}
                >
                  {o.choices?.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              {o.kind === "boolean" && (
                <span className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(s.options[o.key] ?? o.default)}
                    onChange={(e) => set({ options: { ...s.options, [o.key]: e.target.checked } })}
                  />
                  <span className="text-slate-600">Bật</span>
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-3">
        {!setting.customized && !dirty && (
          <span className="text-xs text-slate-400">Đang dùng mặc định</span>
        )}
        <button className={btnPrimary} onClick={save} disabled={!dirty || saving}>
          <Save className="h-4 w-4" /> {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </section>
  );
}

function TemplateSelect({
  label,
  channel,
  value,
  templates,
  onChange,
}: {
  label: string;
  channel: "email" | "sms";
  value: string | null;
  templates: Template[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className={inputCls}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Chọn mẫu —</option>
        {templates
          .filter((t) => t.channel === channel)
          .map((t) => (
            <option key={t.id} value={t.templateCode}>
              {t.templateName} ({t.templateCode}){t.isActive ? "" : " — đang tắt"}
            </option>
          ))}
      </select>
    </label>
  );
}
