"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENTS_PER_DISPUTE,
  DISPUTE_CHANNEL_LABELS,
  DISPUTE_LOG_LABELS,
  DISPUTE_RESOLUTION_MIN,
  DISPUTE_STATUS_LABELS,
  formatFileSize,
  isOpen,
  type DisputeDetail,
  type DisputeStatus,
  type DisputeSubmitOptions,
} from "@/lib/dispute";
import { cn } from "@/lib/utils";
import { channelHint } from "./DisputeForm";
import { disputeApi } from "./dispute-api";

/**
 * Disputes of a transaction (P5.6, SRS-PH-RECON-02-05/06): one card per request with its status,
 * partner submission, evidence files and timeline; actions for payhub-admin while it is open —
 * send to the partner (API / e-mail), record a manual submission, record a partner answer / note,
 * close as resolved / rejected.
 */

const STATUS_STYLE: Record<DisputeStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Processing: "bg-blue-50 text-blue-700 ring-blue-200",
  Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-gray-100 text-gray-600 ring-gray-300",
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STATUS_STYLE[status],
      )}
    >
      {DISPUTE_STATUS_LABELS[status]}
    </span>
  );
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";
const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50";

type Panel = null | "manual" | "note" | "close";
type Notice = { ok: boolean; text: string };

interface CardProps {
  dispute: DisputeDetail;
  submitOptions: DisputeSubmitOptions;
  authToken: string;
  canWrite: boolean;
  onChanged: (notice?: Notice) => void;
  defaultOpen?: boolean;
  showTxnLink?: boolean;
}

export function DisputeCard({
  dispute: d,
  submitOptions,
  authToken,
  canWrite,
  onChanged,
  defaultOpen,
  showTxnLink,
}: CardProps) {
  const [open, setOpen] = useState(defaultOpen ?? isOpen(d.status));
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partnerRef, setPartnerRef] = useState("");
  const [note, setNote] = useState("");
  const [fromPartner, setFromPartner] = useState(true);
  const [outcome, setOutcome] = useState<"Resolved" | "Rejected">("Resolved");
  const [resolution, setResolution] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const writable = canWrite && isOpen(d.status);
  const canAuto = submitOptions.api || submitOptions.email.length > 0;
  const partnerName = d.partner?.name ?? null;

  async function run(action: () => Promise<Notice | void>) {
    setBusy(true);
    setError(null);
    try {
      const n = await action();
      setPanel(null);
      setNote("");
      setPartnerRef("");
      setResolution("");
      onChanged(n ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  }

  const sendAuto = () =>
    run(async () => {
      const r = await disputeApi.submit(authToken, d.id, { mode: "auto" });
      return { ok: true, text: `${d.disputeCode}: ${r.submit?.message ?? "đã gửi đối tác"}` };
    });

  const sendManual = () =>
    run(async () => {
      await disputeApi.submit(authToken, d.id, {
        mode: "manual",
        partner_ref: partnerRef.trim() || undefined,
        note: note.trim() || undefined,
      });
      return { ok: true, text: `${d.disputeCode}: đã ghi nhận gửi đối tác` };
    });

  const saveNote = () =>
    run(async () => {
      await disputeApi.update(authToken, d.id, {
        status: "Processing",
        note: note.trim() || undefined,
        from_partner: fromPartner,
        partner_ref: partnerRef.trim() || undefined,
      });
    });

  const close = () =>
    run(async () => {
      if (resolution.trim().length < DISPUTE_RESOLUTION_MIN) {
        throw new Error(`Nhập kết quả xử lý (tối thiểu ${DISPUTE_RESOLUTION_MIN} ký tự)`);
      }
      await disputeApi.update(authToken, d.id, {
        status: outcome,
        resolution: resolution.trim(),
        partner_ref: partnerRef.trim() || undefined,
      });
      return {
        ok: true,
        text: `${d.disputeCode}: ${DISPUTE_STATUS_LABELS[outcome]} — đã gửi thông báo kết quả`,
      };
    });

  const check = () =>
    run(async () => {
      const r = await disputeApi.check(authToken, d.id);
      return { ok: true, text: `${d.disputeCode}: ${DISPUTE_STATUS_LABELS[r.status]}` };
    });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    await run(async () => {
      const failed: string[] = [];
      for (const f of files) {
        try {
          await disputeApi.upload(authToken, d.id, f);
        } catch (e) {
          failed.push(`${f.name}: ${e instanceof Error ? e.message : "lỗi"}`);
        }
      }
      if (fileInput.current) fileInput.current.value = "";
      if (failed.length) throw new Error(failed.join("; "));
    });
  }

  async function download(attachmentId: number, name: string) {
    setError(null);
    try {
      await disputeApi.download(authToken, d.id, attachmentId, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được tệp");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-gray-50"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <span className="font-mono text-sm font-semibold text-gray-800">{d.disputeCode}</span>
        <DisputeStatusBadge status={d.status} />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{d.reason}</span>
        <span className="text-xs text-gray-400">
          {fmtDateTime(d.createdAt)} · {d.createdBy ?? "—"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {showTxnLink && (
              <div>
                <dt className="text-xs text-gray-500">Giao dịch</dt>
                <dd>
                  <Link
                    href={`/transactions/${d.transactionId}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {d.txnCode}
                  </Link>{" "}
                  <span className="text-xs text-gray-500">({d.txnStatus})</span>
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">Lý do</dt>
              <dd className="text-gray-800">{d.reason}</dd>
            </div>
            {d.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Nội dung</dt>
                <dd className="whitespace-pre-line text-gray-800">{d.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-500">Gửi đối tác</dt>
              <dd className="text-gray-800">
                {d.submittedToPartner && d.submitChannel
                  ? `${DISPUTE_CHANNEL_LABELS[d.submitChannel]} · ${fmtDateTime(d.submittedAt)}`
                  : "Chưa gửi"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Mã phiếu đối tác</dt>
              <dd className="font-mono text-gray-800">{d.partnerRef ?? "—"}</dd>
            </div>
            {d.resolution && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Kết quả xử lý</dt>
                <dd className="rounded-md bg-gray-50 px-3 py-2 whitespace-pre-line text-gray-800">
                  {d.resolution}
                  <span className="mt-1 block text-xs text-gray-500">
                    {d.resolvedBy ?? "—"} · {fmtDateTime(d.resolvedAt)}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {/* Attachments */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Chứng từ ({d.attachments.length})
              </h4>
              {writable && d.attachments.length < ATTACHMENTS_PER_DISPUTE && (
                <>
                  <input
                    ref={fileInput}
                    id={`dispute-upload-${d.id}`}
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={(e) => void upload(e.target.files)}
                  />
                  <label
                    htmlFor={`dispute-upload-${d.id}`}
                    className={cn(
                      btn,
                      "cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    <Paperclip className="h-4 w-4" /> Thêm tệp
                  </label>
                </>
              )}
            </div>
            {d.attachments.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có chứng từ</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {d.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => void download(a.id, a.fileName)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-blue-600 hover:underline"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span className="truncate">{a.fileName}</span>
                    </button>
                    <span className="text-xs text-gray-500">{formatFileSize(a.fileSize)}</span>
                    {writable && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Xoá tệp ${a.fileName}?`)) {
                            void run(async () => {
                              await disputeApi.removeAttachment(authToken, d.id, a.id);
                            });
                          }
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Xoá ${a.fileName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          {writable && (
            <div className="space-y-3 rounded-lg bg-gray-50 p-3">
              <div className="flex flex-wrap gap-2">
                {canAuto && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendAuto()}
                    className={cn(btn, "border-blue-600 bg-blue-600 text-white hover:bg-blue-700")}
                    title={channelHint(submitOptions, partnerName)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {d.submittedToPartner ? "Gửi lại đối tác" : "Gửi đối tác"}
                  </button>
                )}
                {!d.submittedToPartner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPanel(panel === "manual" ? null : "manual")}
                    className={cn(btn, "border-gray-300 bg-white text-gray-700 hover:bg-gray-100")}
                  >
                    Ghi nhận đã gửi
                  </button>
                )}
                {d.status === "Processing" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPanel(panel === "note" ? null : "note")}
                    className={cn(btn, "border-gray-300 bg-white text-gray-700 hover:bg-gray-100")}
                  >
                    Cập nhật phản hồi
                  </button>
                )}
                {d.status === "Processing" && d.submitChannel === "Api" && submitOptions.api && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void check()}
                    className={cn(btn, "border-gray-300 bg-white text-gray-700 hover:bg-gray-100")}
                  >
                    <RefreshCw className="h-4 w-4" /> Hỏi kết quả
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPanel(panel === "close" ? null : "close")}
                  className={cn(
                    btn,
                    "border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50",
                  )}
                >
                  Cập nhật kết quả
                </button>
              </div>
              {!d.submittedToPartner && (
                <p className="text-xs text-gray-500">{channelHint(submitOptions, partnerName)}</p>
              )}

              {panel === "manual" && (
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <input
                    className={inputCls}
                    placeholder="Mã phiếu của đối tác"
                    value={partnerRef}
                    onChange={(e) => setPartnerRef(e.target.value)}
                    aria-label="Mã phiếu của đối tác"
                  />
                  <input
                    className={inputCls}
                    placeholder="Đã gửi qua đâu (cổng merchant, hotline…)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label="Ghi chú cách gửi"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendManual()}
                    className={cn(
                      btn,
                      "h-10 border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
                    )}
                  >
                    Lưu
                  </button>
                </div>
              )}

              {panel === "note" && (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    className={cn(inputCls, "h-auto py-2")}
                    placeholder="Nội dung phản hồi của đối tác / ghi chú nội bộ"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label="Phản hồi / ghi chú"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={fromPartner}
                        onChange={(e) => setFromPartner(e.target.checked)}
                      />
                      Là phản hồi của đối tác
                    </label>
                    <input
                      className={cn(inputCls, "w-56")}
                      placeholder="Mã phiếu đối tác (nếu có)"
                      value={partnerRef}
                      onChange={(e) => setPartnerRef(e.target.value)}
                      aria-label="Mã phiếu đối tác"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveNote()}
                      className={cn(
                        btn,
                        "h-10 border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
                      )}
                    >
                      Lưu
                    </button>
                  </div>
                </div>
              )}

              {panel === "close" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(["Resolved", "Rejected"] as const).map((s) => (
                      <label key={s} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`outcome-${d.id}`}
                          checked={outcome === s}
                          onChange={() => setOutcome(s)}
                        />
                        {DISPUTE_STATUS_LABELS[s]}
                      </label>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    className={cn(inputCls, "h-auto py-2")}
                    placeholder="Kết quả xử lý (bắt buộc) — gửi trong thông báo kết quả và webhook dispute.resolved tới merchant"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    aria-label="Kết quả xử lý"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      className={cn(inputCls, "w-56")}
                      placeholder="Mã phiếu đối tác (nếu có)"
                      value={partnerRef}
                      onChange={(e) => setPartnerRef(e.target.value)}
                      aria-label="Mã phiếu đối tác"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void close()}
                      className={cn(
                        btn,
                        "h-10 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                    >
                      Đóng tra soát
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Timeline */}
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Lịch sử xử lý
            </h4>
            <ol className="space-y-2 border-l border-gray-200 pl-4">
              {d.logs.map((l) => (
                <li key={l.id} className="relative text-sm">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full",
                      l.action.endsWith("failed") ? "bg-red-400" : "bg-blue-400",
                    )}
                  />
                  <span className="font-medium text-gray-800">
                    {DISPUTE_LOG_LABELS[l.action] ?? l.action}
                  </span>
                  {l.fromStatus && l.toStatus && l.fromStatus !== l.toStatus && (
                    <span className="text-xs text-gray-500">
                      {" "}
                      · {l.fromStatus} → {l.toStatus}
                    </span>
                  )}
                  <span className="block text-xs text-gray-400">
                    {fmtDateTime(l.createdAt)} · {l.createdBy ?? "—"}
                  </span>
                  {l.note && <p className="whitespace-pre-line text-gray-600">{l.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

interface HistoryProps {
  disputes: DisputeDetail[];
  submitOptions: DisputeSubmitOptions;
  authToken: string;
  canWrite: boolean;
  onChanged: (notice?: Notice) => void;
}

export function DisputeHistory({
  disputes,
  submitOptions,
  authToken,
  canWrite,
  onChanged,
}: HistoryProps) {
  const open = disputes.filter((d) => isOpen(d.status)).length;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">
        Tra soát ({disputes.length}
        {open ? ` · ${open} đang xử lý` : ""})
      </h3>
      <div className="space-y-3">
        {disputes.map((d) => (
          <DisputeCard
            key={d.id}
            dispute={d}
            submitOptions={submitOptions}
            authToken={authToken}
            canWrite={canWrite}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}
