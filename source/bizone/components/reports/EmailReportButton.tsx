"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";

type ReportRequest = Parameters<typeof trpc.reports.emailReport.mutate>[0]["report"];

/** "Gửi email" (#62, mockup 07): the worker renders the report and emails it as an attachment */
export function EmailReportButton({ auth, request }: { auth: ApiAuth; request: () => unknown }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      const emails = to
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await trpc.reports.emailReport.mutate(
        { report: { ...(request() as object), format } as ReportRequest, to: emails },
        apiContext(auth),
      );
      toast.success(
        `Đang gửi báo cáo tới ${res.to.join(", ")} — xem kết quả ở Thông báo › Lịch sử gửi`,
      );
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={btnSecondary} onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" /> Gửi email
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Gửi báo cáo qua email"
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setOpen(false)}>
              Huỷ
            </button>
            <button className={btnPrimary} onClick={send} disabled={busy || !to.trim()}>
              {busy ? "Đang gửi…" : "Gửi"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Field
            label="Email nhận"
            htmlFor="report-mail-to"
            hint="Tối đa 5 địa chỉ, cách nhau dấu phẩy"
          >
            <input
              id="report-mail-to"
              className={inputCls}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="chucuahang@gmail.com"
            />
          </Field>
          <Field label="File đính kèm" htmlFor="report-mail-format">
            <select
              id="report-mail-format"
              className={inputCls}
              value={format}
              onChange={(e) => setFormat(e.target.value as "xlsx" | "pdf")}
            >
              <option value="xlsx">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </Field>
          <p className="text-xs text-slate-500">
            Báo cáo theo bộ lọc đang chọn. Gửi định kỳ tự động: Thông báo › Cấu hình gửi › Báo cáo
            định kỳ.
          </p>
        </div>
      </Modal>
    </>
  );
}
