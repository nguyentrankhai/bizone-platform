"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  REFUND_REASON_MAX,
  REFUND_REASON_MIN,
  type RefundEligibilityDto,
  type RefundOutcomeView,
} from "@/lib/refund";
import { cn } from "@/lib/utils";
import { RefundApiError, refundApi } from "./refund-api";

/**
 * Refund form (P5.3, mockup "Hoàn tiền"): original transaction on the left, refund type / amount /
 * mandatory reason / internal note on the right, irreversible-action confirmation at the bottom.
 */

interface RefundFormProps {
  authToken: string;
  txn: { id: number; txnCode: string; currency: string; paidAt: string | null };
  eligibility: RefundEligibilityDto;
  onDone: (outcome: RefundOutcomeView) => void;
  onClose: () => void;
}

const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none aria-invalid:border-red-400";

export function formatVnd(n: number): string {
  return `${n.toLocaleString("vi-VN")} ₫`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-right text-sm text-gray-800">{value}</span>
    </div>
  );
}

export function RefundForm({ authToken, txn, eligibility: e, onDone, onClose }: RefundFormProps) {
  const remainingIsAll = e.refundedAmount === 0 && e.inflightAmount === 0;
  const [type, setType] = useState<"full" | "partial">("full");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const partialAmount = Number(amountText.replace(/\D/g, "")) || 0;
  const amount = type === "full" ? e.refundableAmount : partialAmount;
  const amountError =
    type === "partial"
      ? partialAmount <= 0
        ? "Nhập số tiền cần hoàn"
        : partialAmount > e.refundableAmount
          ? `Tối đa ${formatVnd(e.refundableAmount)}`
          : null
      : null;
  const reasonError =
    reason.trim().length < REFUND_REASON_MIN
      ? `Lý do hoàn tiền là bắt buộc (tối thiểu ${REFUND_REASON_MIN} ký tự)`
      : null;

  async function submit() {
    setTouched(true);
    if (amountError || reasonError) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await refundApi.create(authToken, txn.id, {
        amount: type === "full" ? null : partialAmount,
        reason: reason.trim(),
        note: note.trim() || undefined,
      });
      onDone(outcome);
    } catch (err) {
      if (err instanceof RefundApiError && err.outcome) {
        // Refused by the PSP: the attempt is recorded in the history
        onDone(err.outcome);
        return;
      }
      setError(err instanceof Error ? err.message : "Không gửi được yêu cầu hoàn tiền");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-form-title"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="refund-form-title" className="text-base font-semibold text-gray-800">
            Hoàn tiền — <span className="font-mono">{txn.txnCode}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <section className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Giao dịch gốc</h3>
            <Row
              label="Mã GD"
              value={<span className="font-mono text-blue-700">{txn.txnCode}</span>}
            />
            <Row
              label="Số tiền gốc"
              value={<span className="text-base font-bold">{formatVnd(e.paidAmount)}</span>}
            />
            <Row label="Đã hoàn" value={formatVnd(e.refundedAmount)} />
            {e.inflightAmount > 0 && (
              <Row
                label="Đang chờ đối tác"
                value={<span className="text-amber-700">{formatVnd(e.inflightAmount)}</span>}
              />
            )}
            <Row
              label="Có thể hoàn"
              value={<span className="font-semibold">{formatVnd(e.refundableAmount)}</span>}
            />
            <Row label="Đối tác" value={e.partner ?? "—"} />
            <Row label="Thanh toán lúc" value={fmtDate(txn.paidAt)} />
            <Row label="Hạn hoàn tiền" value={fmtDate(e.windowEndsAt)} />
          </section>

          <section className="space-y-4">
            <div>
              <label htmlFor="refund-type" className="mb-1 block text-sm font-medium text-gray-700">
                Loại hoàn tiền
              </label>
              <select
                id="refund-type"
                className={inputCls}
                value={type}
                onChange={(ev) => setType(ev.target.value as "full" | "partial")}
              >
                <option value="full">
                  {remainingIsAll ? "Hoàn tiền toàn phần" : "Hoàn toàn bộ số còn lại"} (
                  {formatVnd(e.refundableAmount)})
                </option>
                {e.partial && <option value="partial">Hoàn tiền một phần</option>}
              </select>
              {!e.partial && (
                <p className="mt-1 text-xs text-gray-500">
                  {e.partner} chỉ hỗ trợ hoàn tiền toàn phần
                </p>
              )}
            </div>

            {type === "partial" && (
              <div>
                <label
                  htmlFor="refund-amount"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Số tiền hoàn (tối đa {formatVnd(e.refundableAmount)})
                </label>
                <input
                  id="refund-amount"
                  inputMode="numeric"
                  className={inputCls}
                  placeholder="Nhập số tiền cần hoàn"
                  value={partialAmount ? partialAmount.toLocaleString("vi-VN") : ""}
                  onChange={(ev) => setAmountText(ev.target.value)}
                  aria-invalid={touched && !!amountError}
                />
                {touched && amountError && (
                  <p className="mt-1 text-xs text-red-600">{amountError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Có thể hoàn nhiều lần — tổng không vượt quá số tiền gốc
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="refund-reason"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Lý do hoàn tiền <span className="text-red-500">*</span>
              </label>
              <textarea
                id="refund-reason"
                rows={3}
                maxLength={REFUND_REASON_MAX}
                className={cn(inputCls, "h-auto py-2")}
                placeholder="Nhập lý do hoàn tiền (bắt buộc) — gửi kèm yêu cầu tới đối tác và merchant"
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                aria-invalid={touched && !!reasonError}
              />
              {touched && reasonError && <p className="mt-1 text-xs text-red-600">{reasonError}</p>}
            </div>

            <div>
              <label htmlFor="refund-note" className="mb-1 block text-sm font-medium text-gray-700">
                Ghi chú nội bộ
              </label>
              <textarea
                id="refund-note"
                rows={2}
                maxLength={1000}
                className={cn(inputCls, "h-auto py-2")}
                placeholder="Ghi chú cho nhân viên vận hành (không gửi đối tác)"
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
              />
            </div>
          </section>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-b-xl border-t border-red-100 bg-red-50 px-5 py-4 sm:flex-row sm:items-center">
          <AlertTriangle className="hidden h-6 w-6 shrink-0 text-red-500 sm:block" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-gray-800">
              Xác nhận hoàn {amount > 0 ? formatVnd(amount) : "tiền"}
            </p>
            <p className="text-xs text-gray-600">
              Yêu cầu được gửi tới {e.partner ?? "đối tác"} và không thể hoàn tác. Trạng thái giao
              dịch cập nhật khi đối tác xác nhận.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Xác nhận hoàn tiền
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
