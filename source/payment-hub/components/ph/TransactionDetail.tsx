"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type TxnStatus } from "@/components/ph/StatusBadge";
import type { RefundOutcomeView, RefundOverviewDto } from "@/lib/refund";
import { RefundForm, formatVnd } from "@/components/ph/RefundForm";
import { RefundHistory, RefundSummary } from "@/components/ph/RefundHistory";
import { TransactionLog, type TxnLogEntry } from "@/components/ph/TransactionLog";
import { RawDataViewer } from "@/components/ph/RawDataViewer";

export interface TxnDetail {
  id: number;
  txnCode: string;
  status: TxnStatus;
  amount: string;
  refundedAmount: string;
  currency: string;
  description: string | null;
  paymentMethod: string | null;
  partnerTxnId: string | null;
  merchantTxnId: string | null;
  returnUrl: string | null;
  webhookUrl: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  ipAddress: string | null;
  metadata: unknown;
  expiredAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  merchant?: { id: number; code: string; name: string } | null;
  logs: TxnLogEntry[];
}

interface TransactionDetailProps {
  txn: TxnDetail;
  refund: RefundOverviewDto;
  authToken: string;
  /** UI hint only (hides write buttons) — the API enforces payhub-admin itself */
  canWrite: boolean;
}

function outcomeText(o: RefundOutcomeView): { ok: boolean; text: string } {
  const amount = formatVnd(o.refund.amount);
  if (o.refund.status === "Completed") {
    return {
      ok: true,
      text: `Đã hoàn ${amount} (${o.refund.refund_code}) — đối tác xác nhận thành công`,
    };
  }
  if (o.refund.status === "Failed") {
    return {
      ok: false,
      text: `Hoàn tiền ${amount} thất bại — ${o.refund.message ?? "đối tác từ chối"}`,
    };
  }
  return {
    ok: true,
    text: `Đã gửi yêu cầu hoàn ${amount} (${o.refund.refund_code}) — chờ đối tác xác nhận`,
  };
}

const METHOD_LABELS: Record<string, string> = {
  vnpay_qr: "VNPay QR",
  vnpay_atm: "VNPay ATM",
  momo_qr: "MoMo",
  zalopay_qr: "ZaloPay",
  vietqr: "VietQR",
};

function fmt(iso: string | null) {
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

function fmtAmount(amount: string, currency: string) {
  const num = parseInt(amount, 10);
  if (isNaN(num)) return amount;
  return num.toLocaleString("vi-VN") + (currency === "VND" ? " ₫" : ` ${currency}`);
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-gray-100 py-2 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm break-all text-gray-800">{value ?? "—"}</span>
    </div>
  );
}

export function TransactionDetail({ txn, refund, authToken, canWrite }: TransactionDetailProps) {
  const router = useRouter();
  const [refundOpen, setRefundOpen] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const isPaid =
    txn.status === "Success" || txn.status === "PartiallyRefunded" || txn.status === "Refunded";
  const canRefund = canWrite && refund.eligibility.refundable;
  const canDispute = txn.status === "Failed" || txn.status === "Expired";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-lg font-bold text-gray-800">{txn.txnCode}</h2>
            <StatusBadge status={txn.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">Tạo lúc {fmt(txn.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          {canRefund && (
            <button
              type="button"
              onClick={() => setRefundOpen(true)}
              className="min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Hoàn tiền
            </button>
          )}
          {canDispute && (
            <button
              type="button"
              className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
            >
              Tra soát
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={
            notice.ok
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
        >
          {notice.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Thông tin cơ bản */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Thông tin giao dịch</h3>
          <InfoRow label="Mã giao dịch" value={<span className="font-mono">{txn.txnCode}</span>} />
          <InfoRow label="Mã GD merchant" value={txn.merchantTxnId} />
          <InfoRow label="Mã GD đối tác" value={txn.partnerTxnId} />
          <InfoRow
            label="Số tiền"
            value={
              <span className="font-semibold text-blue-700">
                {fmtAmount(txn.amount, txn.currency)}
              </span>
            }
          />
          {txn.refundedAmount !== "0" && (
            <InfoRow
              label="Đã hoàn"
              value={
                <span className="text-purple-700">
                  {fmtAmount(txn.refundedAmount, txn.currency)}
                </span>
              }
            />
          )}
          <InfoRow
            label="Phương thức"
            value={
              txn.paymentMethod ? (METHOD_LABELS[txn.paymentMethod] ?? txn.paymentMethod) : null
            }
          />
          <InfoRow label="Mô tả" value={txn.description} />
          <InfoRow label="Hết hạn lúc" value={fmt(txn.expiredAt)} />
          <InfoRow label="Thanh toán lúc" value={fmt(txn.paidAt)} />
        </div>

        {/* Merchant & khách hàng */}
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Merchant</h3>
            <InfoRow label="Tên merchant" value={txn.merchant?.name} />
            <InfoRow label="Mã merchant" value={txn.merchant?.code} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Khách hàng</h3>
            <InfoRow label="Tên" value={txn.customerName} />
            <InfoRow label="Email" value={txn.customerEmail} />
            <InfoRow label="Điện thoại" value={txn.customerPhone} />
            <InfoRow label="IP" value={txn.ipAddress} />
          </div>

          {(isPaid || refund.refunds.length > 0) && (
            <RefundSummary
              eligibility={refund.eligibility}
              count={refund.refunds.filter((r) => r.status === "Completed").length}
              isPaid={isPaid}
            />
          )}
        </div>
      </div>

      {refund.refunds.length > 0 && (
        <RefundHistory
          refunds={refund.refunds}
          authToken={authToken}
          canWrite={canWrite}
          onChanged={() => router.refresh()}
        />
      )}

      {refundOpen && (
        <RefundForm
          authToken={authToken}
          txn={{ id: txn.id, txnCode: txn.txnCode, currency: txn.currency, paidAt: txn.paidAt }}
          eligibility={refund.eligibility}
          onClose={() => setRefundOpen(false)}
          onDone={(outcome) => {
            setRefundOpen(false);
            setNotice(outcomeText(outcome));
            router.refresh();
          }}
        />
      )}

      {/* Log giao dịch */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Log giao dịch</h3>
        <TransactionLog logs={txn.logs} />
      </div>

      {/* Raw data */}
      {txn.metadata != null && (
        <RawDataViewer data={txn.metadata as Record<string, unknown>} title="Metadata" />
      )}
    </div>
  );
}
