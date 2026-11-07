"use client";

import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import { Change, Panel, SERIES, tdNum, thCls, thNum } from "./shared";

type Staff = RouterOutputs["reports"]["staff"];

export function StaffPerformance({
  data,
  compareLabel,
}: {
  data: Staff;
  compareLabel: string | null;
}) {
  return (
    <Panel title="Hiệu quả nhân viên">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className={thCls}>Nhân viên</th>
              <th className={thNum}>DT thuần</th>
              <th className={thCls}>Tỷ trọng</th>
              <th className={thNum}>Số HĐ</th>
              <th className={thNum}>TB/HĐ</th>
              <th className={thNum}>SL bán</th>
              <th className={thNum}>Lợi nhuận</th>
              {compareLabel && <th className={thNum}>So với {compareLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.userId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{r.fullName}</span>
                  {!r.isActive && <span className="ml-1 text-xs text-slate-400">(đã nghỉ)</span>}
                </td>
                <td className={`${tdNum} font-medium`}>{fmtMoney(r.net)}</td>
                <td className="min-w-32 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.max(0, r.share)}%`, background: SERIES.current }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-slate-600 tabular-nums">
                      {fmtNumber(r.share)}%
                    </span>
                  </div>
                </td>
                <td className={tdNum}>{r.invoices}</td>
                <td className={tdNum}>{r.invoices ? fmtMoney(r.avgPerInvoice) : "—"}</td>
                <td className={tdNum}>{fmtNumber(r.qty)}</td>
                <td className={tdNum}>{fmtMoney(r.profit)}</td>
                {compareLabel && (
                  <td className={tdNum}>
                    <Change value={r.change} />
                  </td>
                )}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  Không có doanh số trong kỳ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
