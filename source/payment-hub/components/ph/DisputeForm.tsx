"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Trash2, X } from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_DISPUTE,
  ATTACHMENT_TYPES,
  DISPUTE_DESCRIPTION_MAX,
  DISPUTE_REASONS,
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  fileExtension,
  formatFileSize,
  type DisputeSubmitOptions,
} from "@/lib/dispute";
import { cn } from "@/lib/utils";
import { disputeApi } from "./dispute-api";

/**
 * Dispute form (P5.6, SRS-PH-RECON-02-01/02/07): transaction summary, reason (required — preset or
 * free text), content, evidence files, "send to partner now". Flow: create → upload each file →
 * send (so the partner e-mail carries the evidence). A failed upload / send leaves the dispute
 * recorded; the operator retries from its card.
 */

export interface DisputeTxnSummary {
  id: number;
  txnCode: string;
  status: string;
  amount: number;
  currency: string;
  partnerTxnId: string | null;
  partnerName: string | null;
}

interface DisputeFormProps {
  authToken: string;
  txn: DisputeTxnSummary;
  submitOptions: DisputeSubmitOptions;
  defaultReason?: string;
  onClose: () => void;
  onDone: (notice: { ok: boolean; text: string }) => void;
}

const OTHER = "__other__";
const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none aria-invalid:border-red-400";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-right text-sm break-all text-gray-800">{value}</span>
    </div>
  );
}

export function channelHint(o: DisputeSubmitOptions, partner: string | null): string {
  if (o.api) return `Gửi qua API tra soát của ${partner ?? "đối tác"}`;
  if (o.email.length) {
    return (
      `Gửi email kèm chứng từ tới ${o.email.join(", ")}` +
      (o.emailLogOnly ? " (máy chủ chưa cấu hình SMTP — email chỉ được ghi log)" : "")
    );
  }
  return `${partner ?? "Đối tác"} chưa có API / email tra soát — sau khi gửi qua cổng đối tác, bấm "Ghi nhận đã gửi" trên yêu cầu`;
}

export function DisputeForm({
  authToken,
  txn,
  submitOptions,
  defaultReason,
  onClose,
  onDone,
}: DisputeFormProps) {
  const preset = defaultReason && (DISPUTE_REASONS as readonly string[]).includes(defaultReason);
  const [reasonChoice, setReasonChoice] = useState<string>(
    defaultReason ? (preset ? defaultReason : OTHER) : "",
  );
  const [customReason, setCustomReason] = useState(defaultReason && !preset ? defaultReason : "");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const canAutoSend = submitOptions.api || submitOptions.email.length > 0;
  const [sendNow, setSendNow] = useState(canAutoSend);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reason = (reasonChoice === OTHER ? customReason : reasonChoice).trim();
  const reasonError =
    reason.length < DISPUTE_REASON_MIN
      ? `Lý do tra soát là bắt buộc (tối thiểu ${DISPUTE_REASON_MIN} ký tự)`
      : null;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ATTACHMENT_TYPES[fileExtension(f.name)]) {
        setFileError(`${f.name}: định dạng không được nhận`);
        continue;
      }
      if (f.size > ATTACHMENT_MAX_BYTES) {
        setFileError(`${f.name}: vượt quá ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`);
        continue;
      }
      if (next.length >= ATTACHMENTS_PER_DISPUTE) {
        setFileError(`Tối đa ${ATTACHMENTS_PER_DISPUTE} tệp`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setTouched(true);
    if (reasonError) return;
    setError(null);
    setBusy("Đang tạo yêu cầu…");
    let created;
    try {
      created = await disputeApi.create(authToken, {
        transaction_id: txn.id,
        reason,
        description: description.trim() || undefined,
        submit: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được yêu cầu tra soát");
      setBusy(null);
      return;
    }
    const code = created.dispute.disputeCode;
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Đang tải tệp ${i + 1}/${files.length}…`);
      try {
        await disputeApi.upload(authToken, created.dispute.id, files[i]!);
      } catch (e) {
        failed.push(`${files[i]!.name} (${e instanceof Error ? e.message : "lỗi"})`);
      }
    }
    let sendText = "";
    let ok = failed.length === 0;
    if (sendNow && canAutoSend) {
      setBusy("Đang gửi đối tác…");
      try {
        const r = await disputeApi.submit(authToken, created.dispute.id, { mode: "auto" });
        sendText = r.submit ? ` — ${r.submit.message}` : "";
      } catch (e) {
        ok = false;
        sendText = ` — chưa gửi được đối tác: ${e instanceof Error ? e.message : "lỗi"} (gửi lại trên yêu cầu)`;
      }
    }
    setBusy(null);
    onDone({
      ok,
      text:
        `Đã tạo yêu cầu tra soát ${code}${files.length ? ` (${files.length - failed.length}/${files.length} tệp)` : ""}${sendText}` +
        (failed.length ? `. Tệp lỗi: ${failed.join("; ")}` : ""),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispute-form-title"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="dispute-form-title" className="text-base font-semibold text-gray-800">
            Tra soát — <span className="font-mono">{txn.txnCode}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[2fr_3fr]">
          <section className="h-fit rounded-lg border border-gray-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Giao dịch</h3>
            <Row
              label="Mã GD"
              value={<span className="font-mono text-blue-700">{txn.txnCode}</span>}
            />
            <Row label="Mã GD đối tác" value={txn.partnerTxnId ?? "—"} />
            <Row
              label="Số tiền"
              value={
                <span className="font-semibold">
                  {txn.amount.toLocaleString("vi-VN")} {txn.currency === "VND" ? "₫" : txn.currency}
                </span>
              }
            />
            <Row label="Trạng thái" value={txn.status} />
            <Row label="Đối tác" value={txn.partnerName ?? "—"} />
          </section>

          <section className="space-y-4">
            <div>
              <label
                htmlFor="dispute-reason"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Lý do tra soát <span className="text-red-500">*</span>
              </label>
              <select
                id="dispute-reason"
                className={inputCls}
                value={reasonChoice}
                onChange={(e) => setReasonChoice(e.target.value)}
                aria-invalid={touched && !!reasonError && reasonChoice !== OTHER}
              >
                <option value="">— Chọn lý do —</option>
                {DISPUTE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value={OTHER}>Khác (nhập lý do)</option>
              </select>
              {reasonChoice === OTHER && (
                <input
                  className={cn(inputCls, "mt-2")}
                  maxLength={DISPUTE_REASON_MAX}
                  placeholder="Nhập lý do tra soát"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  aria-label="Lý do tra soát khác"
                  aria-invalid={touched && !!reasonError}
                />
              )}
              {touched && reasonError && <p className="mt-1 text-xs text-red-600">{reasonError}</p>}
            </div>

            <div>
              <label
                htmlFor="dispute-desc"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Nội dung tra soát
              </label>
              <textarea
                id="dispute-desc"
                rows={4}
                maxLength={DISPUTE_DESCRIPTION_MAX}
                className={cn(inputCls, "h-auto py-2")}
                placeholder="Mô tả chi tiết: thời điểm khách thanh toán, ngân hàng / ví, số tiền bị trừ, mã tham chiếu trên sao kê…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Chứng từ đính kèm
              </span>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                id="dispute-files"
                onChange={(e) => addFiles(e.target.files)}
              />
              <label
                htmlFor="dispute-files"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
              >
                <Paperclip className="h-4 w-4" /> Chọn tệp (ảnh, PDF, Excel, Word… ≤{" "}
                {ATTACHMENT_MAX_BYTES / 1024 / 1024} MB)
              </label>
              {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
              {files.length > 0 && (
                <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-gray-500">{formatFileSize(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Bỏ ${f.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={sendNow && canAutoSend}
                  disabled={!canAutoSend}
                  onChange={(e) => setSendNow(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Gửi đối tác ngay</span>
                  <span className="block text-xs text-gray-500">
                    {channelHint(submitOptions, txn.partnerName)}
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {busy && <span className="flex-1 text-sm text-gray-600">{busy}</span>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={!!busy}
              className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!!busy}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo yêu cầu tra soát
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
