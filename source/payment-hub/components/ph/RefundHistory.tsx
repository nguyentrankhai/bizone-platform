"use client";

import { useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import type { RefundEligibilityDto, RefundView } from "@/lib/refund";
import { cn } from "@/lib/utils";
import { formatVnd } from "./RefundForm";
import { RefundApiError, refundApi } from "./refund-api";

/** Refund summary card + refund history with actions on Processing refunds (P5.3). */

const STATUS: Record<RefundView["status"], { label: string; className: string }> = {
  Pending: { label: "Chờ gửi", className: "bg-gray-100 text-gray-600 border-gray-200" },
  Processing: { label: "Chờ đối tác", className: "bg-amber-100 text-amber-700 border-amber-200" },
  Completed: {
    label: "Hoàn tất",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  Failed: { label: "Thất bại", className: "bg-red-100 text-red-700 border-red-200" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RefundSummary({
  eligibility: e,
  count,
  isPaid,
}: {
  eligibility: RefundEligibilityDto;
  count: number;
  isPaid: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Hoàn tiền</h3>
      <dl className="space-y-0 text-sm">
        {[
          [
            "Đã hoàn",
            <span key="r" className="text-purple-700">
              {formatVnd(e.refundedAmount)}
            </span>,
          ],
          ...(e.inflightAmount > 0
            ? [
                [
                  "Chờ đối tác xác nhận",
                  <span key="i" className="text-amber-700">
                    {formatVnd(e.inflightAmount)}
                  </span>,
                ],
              ]
            : []),
          [
            "Có thể hoàn",
            <span key="a" className="font-semibold">
              {formatVnd(e.refundable ? e.refundableAmount : 0)}
            </span>,
          ],
          ["Số lần hoàn", String(count)],
          ...(isPaid && e.windowEndsAt ? [["Hạn hoàn tiền", fmt(e.windowEndsAt)]] : []),
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="flex gap-2 border-b border-gray-100 py-2 last:border-0"
          >
            <dt className="w-44 shrink-0 text-xs font-medium text-gray-500">{label}</dt>
            <dd className="text-sm text-gray-800">{value}</dd>
          </div>
        ))}
      </dl>
      {isPaid && !e.refundable && e.reason && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{e.reason}</p>
      )}
    </div>
  );
}

interface RefundHistoryProps {
  refunds: RefundView[];
  authToken: string;
  canWrite: boolean;
  onChanged: () => void;
}

export function RefundHistory({ refunds, authToken, canWrite, onChanged }: RefundHistoryProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resolving, setResolving] = useState<RefundView | null>(null);

  async function check(r: RefundView) {
    setBusyId(r.id);
    setMessage(null);
    try {
      const out = await refundApi.check(authToken, r.id);
      setMessage({
        ok: true,
        text:
          out.refund.status === "Processing"
            ? `${r.refund_code}: đối tác vẫn đang xử lý`
            : `${r.refund_code}: ${STATUS[out.refund.status].label.toLowerCase()}`,
      });
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Không kiểm tra được" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Lịch sử hoàn tiền</h3>
      {message && (
        <p
          className={cn(
            "mb-3 rounded-lg px-3 py-2 text-sm",
            message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2 pr-3 font-medium">Mã hoàn</th>
              <th className="py-2 pr-3 font-medium">Thời gian</th>
              <th className="py-2 pr-3 text-right font-medium">Số tiền</th>
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 pr-3 font-medium">Lý do</th>
              <th className="py-2 pr-3 font-medium">Người yêu cầu</th>
              <th className="py-2 font-medium">Đối tác</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 align-top last:border-0">
                <td className="py-2.5 pr-3 font-mono text-xs text-gray-800">{r.refund_code}</td>
                <td className="py-2.5 pr-3 text-xs whitespace-nowrap text-gray-600">
                  {fmt(r.created_at)}
                  {r.processed_at && (
                    <div className="text-gray-400">xong {fmt(r.processed_at)}</div>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold whitespace-nowrap">
                  {formatVnd(r.amount)}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                      STATUS[r.status].className,
                    )}
                  >
                    {STATUS[r.status].label}
                  </span>
                  {r.status === "Processing" && canWrite && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!r.manual_check && (
                        <button
                          type="button"
                          onClick={() => void check(r)}
                          disabled={busyId === r.id}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-300 px-2 text-xs hover:bg-gray-50 disabled:opacity-60"
                        >
                          {busyId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Kiểm tra
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setResolving(r)}
                        className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 hover:bg-amber-100"
                      >
                        Xác nhận thủ công
                      </button>
                    </div>
                  )}
                </td>
                <td className="max-w-[220px] py-2.5 pr-3 text-xs text-gray-700">
                  {r.reason}
                  {r.internal_note && (
                    <div className="mt-1 text-gray-400">Ghi chú: {r.internal_note}</div>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-xs text-gray-600">
                  {r.requested_by ?? "—"}
                  <div className="text-gray-400">
                    {r.channel === "Merchant" ? "API merchant" : "Quản trị"}
                  </div>
                </td>
                <td className="max-w-[240px] py-2.5 text-xs text-gray-600">
                  {r.partner_refund_id && <div className="font-mono">{r.partner_refund_id}</div>}
                  {r.message && (
                    <div className={r.status === "Failed" ? "text-red-600" : "text-gray-500"}>
                      {r.message}
                    </div>
                  )}
                  {!r.partner_refund_id && !r.message && "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resolving && (
        <ResolveDialog
          refund={resolving}
          authToken={authToken}
          onClose={() => setResolving(null)}
          onDone={(text) => {
            setResolving(null);
            setMessage({ ok: true, text });
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ResolveDialog({
  refund,
  authToken,
  onClose,
  onDone,
}: {
  refund: RefundView;
  authToken: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [outcome, setOutcome] = useState<"Completed" | "Failed">("Completed");
  const [partnerId, setPartnerId] = useState(refund.partner_refund_id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (note.trim().length < 3) {
      setError("Ghi rõ căn cứ xác nhận (tối thiểu 3 ký tự)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await refundApi.resolve(authToken, refund.id, {
        outcome,
        note: note.trim(),
        partner_refund_id: partnerId.trim() || undefined,
      });
      onDone(`${refund.refund_code}: đã ghi nhận ${STATUS[out.refund.status].label.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof RefundApiError ? err.message : "Không cập nhật được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-resolve-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="refund-resolve-title" className="text-base font-semibold text-gray-800">
            Xác nhận kết quả hoàn tiền {refund.refund_code}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Payment Hub chưa nhận được kết quả từ đối tác. Kiểm tra giao dịch hoàn{" "}
            {formatVnd(refund.amount)} trên cổng đối tác rồi ghi nhận kết quả thực tế.
          </p>
          <fieldset className="flex gap-4">
            <legend className="sr-only">Kết quả</legend>
            {(
              [
                ["Completed", "Đối tác đã hoàn tiền"],
                ["Failed", "Đối tác không hoàn tiền"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="refund-outcome"
                  checked={outcome === v}
                  onChange={() => setOutcome(v)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {outcome === "Completed" && (
            <div>
              <label htmlFor="resolve-partner-id" className="mb-1 block font-medium text-gray-700">
                Mã hoàn tiền của đối tác
              </label>
              <input
                id="resolve-partner-id"
                className="h-10 w-full rounded-lg border border-gray-300 px-3"
                value={partnerId}
                onChange={(ev) => setPartnerId(ev.target.value)}
              />
            </div>
          )}
          <div>
            <label htmlFor="resolve-note" className="mb-1 block font-medium text-gray-700">
              Căn cứ xác nhận <span className="text-red-500">*</span>
            </label>
            <textarea
              id="resolve-note"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="VD: đã đối chiếu trên cổng merchant VNPay lúc 15:20"
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Ghi nhận
          </button>
        </div>
      </div>
    </div>
  );
}
