"use client";

import Link from "next/link";
import { StatusBadge, type TxnStatus } from "@/components/ph/StatusBadge";

export interface TxnRow {
  id: number;
  txnCode: string;
  createdAt: string;
  amount: string;
  currency: string;
  status: TxnStatus;
  paymentMethod: string | null;
  merchant?: { id: number; code: string; name: string } | null;
  customerName: string | null;
}

interface TransactionTableProps {
  rows: TxnRow[];
  loading?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  vnpay_qr: "VNPay QR",
  vnpay_atm: "VNPay ATM",
  momo_qr: "MoMo",
  zalopay_qr: "ZaloPay",
  vietqr: "VietQR",
};

function formatAmount(amount: string, currency: string) {
  const num = parseInt(amount, 10);
  if (isNaN(num)) return amount;
  return num.toLocaleString("vi-VN") + (currency === "VND" ? " ₫" : ` ${currency}`);
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TransactionTable({ rows, loading }: TransactionTableProps) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
        <p className="text-sm text-gray-400">Không có giao dịch nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              {[
                "MÃ GIAO DỊCH",
                "THỜI GIAN",
                "SỐ TIỀN",
                "TRẠNG THÁI",
                "PHƯƠNG THỨC",
                "ĐỐI TÁC / MERCHANT",
              ].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-xs font-medium tracking-wide whitespace-nowrap text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-blue-50/40">
                <td className="px-5 py-3">
                  <Link
                    href={`/transactions/${t.txnCode}`}
                    className="font-mono text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {t.txnCode}
                  </Link>
                </td>
                <td className="px-5 py-3 text-xs whitespace-nowrap text-gray-500">
                  {formatDateTime(t.createdAt)}
                </td>
                <td className="px-5 py-3 font-semibold text-gray-800">
                  {formatAmount(t.amount, t.currency)}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {t.paymentMethod ? (
                    (METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod)
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {t.merchant?.name ?? <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
