"use client";

import Link from "next/link";
import type { RecentTxn } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { StatusBadge, type TxnStatus } from "./StatusBadge";
import { fmtDateTime, fmtVnd } from "./dashboard-format";

/** 10 most recent transactions (SRS-PH-DASH-01-05). New rows are highlighted briefly. */
export function RecentTransactions({
  items,
  highlight,
}: {
  items: RecentTxn[];
  highlight?: ReadonlySet<number>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="recent-transactions">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <th className="px-4 py-2.5">Mã GD</th>
            <th className="px-4 py-2.5">Thời gian</th>
            <th className="px-4 py-2.5 text-right">Số tiền</th>
            <th className="px-4 py-2.5">Trạng thái</th>
            <th className="px-4 py-2.5">Đối tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((t) => (
            <tr
              key={t.id}
              className={cn(
                "transition-colors hover:bg-gray-50",
                highlight?.has(t.id) && "bg-blue-50",
              )}
            >
              <td className="px-4 py-2.5 whitespace-nowrap">
                <Link
                  href={`/transactions/${t.id}`}
                  className="font-mono text-xs font-semibold text-blue-600 hover:underline"
                >
                  {t.txnCode}
                </Link>
                <p className="text-[11px] text-gray-400">{t.merchantCode}</p>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">
                {fmtDateTime(t.createdAt)}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-gray-800 tabular-nums">
                {fmtVnd(t.amount)}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={t.status as TxnStatus} />
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{t.partner}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                Chưa có giao dịch
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
