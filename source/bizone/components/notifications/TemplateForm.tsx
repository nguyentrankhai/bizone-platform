"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import { COMMON_VARIABLES, NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import { smsText } from "@/lib/notifications/template";

type Template = RouterOutputs["notification"]["templates"][number];

const ALL_VARIABLES = [
  ...new Set([
    ...COMMON_VARIABLES,
    ...Object.values(NOTIFICATION_EVENTS).flatMap((e) => e.variables as readonly string[]),
    "customer_name",
    "points",
    "ranking",
    "invoice_code",
  ]),
];

/** Create / edit a notification template with live preview and "Gửi thử" (SRS §9 templates) */
export function TemplateForm({
  auth,
  template,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  /** null = new template */
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    templateCode: template?.templateCode ?? "",
    templateName: template?.templateName ?? "",
    channel: (template?.channel ?? "email") as "email" | "sms",
    subject: template?.subject ?? "",
    content: template?.content ?? "",
    isActive: template?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    subject: string | null;
    content: string;
    unknown: string[];
  } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  // Live preview with sample values (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      trpc.notification.previewTemplate
        .query(
          { subject: f.channel === "email" ? f.subject || null : null, content: f.content },
          apiContext(auth),
        )
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [f.subject, f.content, f.channel, auth]);

  async function save() {
    setSaving(true);
    setError("");
    const body = {
      templateName: f.templateName,
      channel: f.channel,
      subject: f.channel === "email" ? f.subject || null : null,
      content: f.content,
      isActive: f.isActive,
    };
    try {
      if (template) {
        await trpc.notification.updateTemplate.mutate(
          { id: template.id, ...body },
          apiContext(auth),
        );
      } else {
        await trpc.notification.createTemplate.mutate(
          { templateCode: f.templateCode, ...body },
          apiContext(auth),
        );
      }
      toast.success("Đã lưu mẫu thông báo");
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!template) return;
    setTesting(true);
    try {
      const res = await trpc.notification.sendTest.mutate(
        { id: template.id, to: testTo },
        apiContext(auth),
      );
      toast.success(
        res.provider === "log"
          ? "Đã gửi thử (chế độ ghi log — xem Lịch sử gửi)"
          : `Đã gửi thử tới ${testTo}`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  const smsPreview = preview && f.channel === "sms" ? smsText(preview.content, false) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={template ? `Sửa mẫu ${template.templateCode}` : "Thêm mẫu thông báo"}
      footer={
        <div className="flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>
            Đóng
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu mẫu"}
          </button>
        </div>
      }
    >
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto md:grid-cols-2">
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Field
            label="Mã mẫu"
            htmlFor="tpl-code"
            hint="Chữ thường, số, dấu _ — không đổi được sau khi tạo"
          >
            <input
              id="tpl-code"
              className={inputCls}
              value={f.templateCode}
              disabled={!!template}
              onChange={(e) => setF({ ...f, templateCode: e.target.value })}
              placeholder="order_new_email"
            />
          </Field>
          <Field label="Tên mẫu" htmlFor="tpl-name">
            <input
              id="tpl-name"
              className={inputCls}
              value={f.templateName}
              onChange={(e) => setF({ ...f, templateName: e.target.value })}
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Kênh" htmlFor="tpl-channel">
              <select
                id="tpl-channel"
                className={inputCls}
                value={f.channel}
                onChange={(e) => setF({ ...f, channel: e.target.value as "email" | "sms" })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </Field>
            <label className="mt-6 flex h-10 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={f.isActive}
                onChange={(e) => setF({ ...f, isActive: e.target.checked })}
              />
              Đang dùng
            </label>
          </div>
          {f.channel === "email" && (
            <Field label="Tiêu đề email" htmlFor="tpl-subject">
              <input
                id="tpl-subject"
                className={inputCls}
                value={f.subject}
                onChange={(e) => setF({ ...f, subject: e.target.value })}
              />
            </Field>
          )}
          <Field
            label="Nội dung"
            htmlFor="tpl-content"
            hint={
              f.channel === "sms"
                ? `${f.content.length}/640 ký tự — gửi không dấu nếu SMS_UNICODE=false`
                : "Văn bản thường, xuống dòng giữ nguyên; liên kết tự thành link"
            }
          >
            <textarea
              id="tpl-content"
              rows={8}
              className={inputCls.replace("h-10", "") + " py-2"}
              value={f.content}
              onChange={(e) => setF({ ...f, content: e.target.value })}
            />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Chèn biến (bấm để thêm)</p>
            <div className="flex flex-wrap gap-1">
              {ALL_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, content: `${x.content}{{${v}}}` }))}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Xem trước (dữ liệu mẫu)</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            {preview?.subject && (
              <p className="mb-2 border-b border-slate-200 pb-2 font-semibold text-slate-800">
                {preview.subject}
              </p>
            )}
            <p className="whitespace-pre-wrap text-slate-700">
              {smsPreview ?? preview?.content ?? "…"}
            </p>
          </div>
          {preview && preview.unknown.length > 0 && (
            <p className="text-xs text-amber-700">
              Biến không có trong danh sách (sẽ để trống): {preview.unknown.join(", ")}
            </p>
          )}
          {template ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Gửi thử mẫu đã lưu</p>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={f.channel === "email" ? "email@cuahang.vn" : "0901234567"}
                  aria-label="Gửi thử tới"
                />
                <button
                  className={btnSecondary}
                  onClick={sendTest}
                  disabled={testing || !testTo.trim()}
                >
                  <Send className="h-4 w-4" /> {testing ? "Đang gửi…" : "Gửi thử"}
                </button>
              </div>
              <p className="text-xs text-slate-500">Lưu thay đổi trước khi gửi thử.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Lưu mẫu để gửi thử.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
