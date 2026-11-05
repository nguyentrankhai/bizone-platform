"use client";

import type { TopMerchant } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { fmtInt, fmtVnd } from "./dashboard-format";

/** Top merchants by revenue in the selected period (SRS-PH-DASH-01-06). */
export function TopMerchants({ items }: { items: TopMerchant[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="top-merchants">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <th className="px-4 py-2.5">#</th>
            <th className="px-4 py-2.5">Merchant</th>
            <th className="px-4 py-2.5 text-right">Số GD</th>
            <th className="px-4 py-2.5 text-right">Doanh thu</th>
            <th className="px-4 py-2.5 text-right">Tỷ lệ thành công</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((m, i) => (
            <tr key={m.merchantId}>
              <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
              <td className="px-4 py-2.5">
                <p className="font-semibold text-gray-800">{m.name}</p>
                <p className="font-mono text-[11px] text-gray-400">{m.code}</p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(m.count)}</td>
              <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                {fmtVnd(m.revenue)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    m.successRate === null
                      ? "bg-gray-100 text-gray-500"
                      : m.successRate >= 95
                        ? "bg-emerald-100 text-emerald-700"
                        : m.successRate >= 85
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700",
                  )}
                >
                  {m.successRate === null ? "—" : `${m.successRate}%`}
                </span>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                Chưa có giao dịch trong khoảng này
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
