"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import { renderTemplate, smsText } from "@/lib/notifications/template";
import { RANKINGS } from "@/lib/validators/notification";
import { RANKING_LABEL, localIn } from "./shared";

type Campaign = RouterOutputs["campaign"]["list"]["items"][number];
type Audience = Campaign["audience"];

const VARIABLES = ["customer_name", "store_name", "points", "ranking", "customer_phone"];
const SAMPLE = {
  customer_name: "Nguyễn Văn A",
  store_name: "Cửa hàng",
  points: "1.250",
  ranking: "Gold",
  customer_phone: "0901234567",
};

/** Create / edit a draft campaign; "Lưu & hẹn gửi" schedules it (VN time) */
export function CampaignForm({
  auth,
  campaign,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    channel: (campaign?.channel ?? "sms") as "email" | "sms",
    subject: campaign?.subject ?? "",
    content: campaign?.content ?? "",
  });
  const [audience, setAudience] = useState<Audience>(
    campaign?.audience ?? { rankings: [], groupIds: [], minSpent: null, birthdayMonth: null },
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<RouterOutputs["campaign"]["previewAudience"] | null>(null);
  const groups = useLoad("groups", () => trpc.campaign.groups.query(undefined, apiContext(auth)));

  useEffect(() => {
    const t = setTimeout(() => {
      trpc.campaign.previewAudience
        .query({ channel: f.channel, audience }, apiContext(auth))
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [f.channel, audience, auth]);

  async function save(schedule: boolean) {
    setSaving(true);
    setError("");
    const body = {
      name: f.name,
      channel: f.channel,
      subject: f.channel === "email" ? f.subject || null : null,
      content: f.content,
      audience,
    };
    try {
      const id = campaign
        ? (await trpc.campaign.update.mutate({ id: campaign.id, ...body }, apiContext(auth))).id
        : (await trpc.campaign.create.mutate(body, apiContext(auth))).id;
      if (schedule) {
        await trpc.campaign.send.mutate({ id, scheduledAt }, apiContext(auth));
        toast.success("Đã hẹn gửi chiến dịch");
      } else {
        toast.success("Đã lưu nháp");
      }
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const rendered = renderTemplate(f.content, SAMPLE);
  const shown = f.channel === "sms" ? smsText(rendered, false) : rendered;
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={campaign ? `Sửa chiến dịch "${campaign.name}"` : "Tạo chiến dịch"}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="datetime-local"
            className={inputCls + " w-auto"}
            value={scheduledAt}
            min={localIn(2)}
            onChange={(e) => setScheduledAt(e.target.value)}
            aria-label="Hẹn gửi lúc (giờ VN)"
          />
          <button
            className={btnSecondary}
            onClick={() => save(true)}
            disabled={saving || !scheduledAt}
          >
            Lưu & hẹn gửi
          </button>
          <button className={btnPrimary} onClick={() => save(false)} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu nháp"}
          </button>
        </div>
      }
    >
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto md:grid-cols-2">
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Field label="Tên chiến dịch" htmlFor="cp-name">
            <input
              id="cp-name"
              className={inputCls}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field label="Kênh" htmlFor="cp-channel">
            <select
              id="cp-channel"
              className={inputCls}
              value={f.channel}
              onChange={(e) => setF({ ...f, channel: e.target.value as "email" | "sms" })}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </Field>
          {f.channel === "email" && (
            <Field label="Tiêu đề email" htmlFor="cp-subject">
              <input
                id="cp-subject"
                className={inputCls}
                value={f.subject}
                onChange={(e) => setF({ ...f, subject: e.target.value })}
              />
            </Field>
          )}
          <Field
            label="Nội dung"
            htmlFor="cp-content"
            hint={
              f.channel === "sms" ? `${shown.length} ký tự sau khi điền biến (bỏ dấu)` : undefined
            }
          >
            <textarea
              id="cp-content"
              rows={6}
              className={inputCls.replace("h-10", "") + " py-2"}
              value={f.content}
              onChange={(e) => setF({ ...f, content: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setF((x) => ({ ...x, content: `${x.content}{{${v}}}` }))}
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:bg-blue-50"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-slate-500">Xem trước</p>
            <p className="whitespace-pre-wrap text-slate-700">{shown || "…"}</p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">Đối tượng</p>
          <div>
            <p className="mb-1 text-sm text-slate-600">Hạng thành viên (bỏ trống = tất cả)</p>
            <div className="flex flex-wrap gap-2">
              {RANKINGS.map((r) => (
                <label
                  key={r}
                  className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={audience.rankings.includes(r)}
                    onChange={() =>
                      setAudience({ ...audience, rankings: toggle(audience.rankings, r) })
                    }
                  />
                  {RANKING_LABEL[r] ?? r}
                </label>
              ))}
            </div>
          </div>
          {(groups.data?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-sm text-slate-600">Nhóm khách hàng</p>
              <div className="flex flex-wrap gap-2">
                {groups.data!.map((g) => (
                  <label
                    key={g.id}
                    className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={audience.groupIds.includes(g.id)}
                      onChange={() =>
                        setAudience({ ...audience, groupIds: toggle(audience.groupIds, g.id) })
                      }
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chi tiêu tối thiểu (₫)" htmlFor="cp-spent">
              <input
                id="cp-spent"
                type="number"
                min={0}
                className={inputCls}
                value={audience.minSpent ?? ""}
                onChange={(e) =>
                  setAudience({
                    ...audience,
                    minSpent: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Sinh nhật tháng" htmlFor="cp-bday">
              <select
                id="cp-bday"
                className={inputCls}
                value={audience.birthdayMonth ?? ""}
                onChange={(e) =>
                  setAudience({
                    ...audience,
                    birthdayMonth: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Bất kỳ</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Tháng {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            {preview ? (
              <>
                <p className="font-semibold">
                  {preview.count.toLocaleString("vi-VN")} khách nhận được
                  {preview.tooMany ? " — vượt giới hạn 5.000, thu hẹp đối tượng" : ""}
                </p>
                <p className="text-xs text-blue-800">
                  Chỉ khách đang hoạt động có {f.channel === "email" ? "email" : "SĐT di động"} hợp
                  lệ
                </p>
                {preview.sample.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {preview.sample.map((m) => (
                      <li key={m.id}>
                        {m.name} — {m.contact}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              "Đang đếm khách hàng…"
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
