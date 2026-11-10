"use client";

import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import { Change, KpiTile, Panel, SERIES, tdNum, thCls, thNum } from "./shared";

type Branches = RouterOutputs["reports"]["branches"];

/** Báo cáo tổng hợp nhiều chi nhánh (P4.6): tổng + từng chi nhánh, tỷ trọng, so sánh kỳ trước */
export function BranchSummary({
  data,
  compareLabel,
}: {
  data: Branches;
  compareLabel: string | null;
}) {
  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Doanh thu thuần (tổng)"
          value={fmtMoney(s.current.net)}
          change={s.change?.net}
        />
        <KpiTile
          label="Lợi nhuận gộp"
          value={fmtMoney(s.current.profit)}
          change={s.change?.profit}
        />
        <KpiTile
          label="Số hoá đơn"
          value={fmtNumber(s.current.invoices)}
          change={s.change?.invoices}
        />
        <KpiTile label="Số chi nhánh" value={String(data.branches.length)} />
      </div>
      <Panel title="So sánh chi nhánh">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" data-testid="branch-report">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Chi nhánh</th>
                <th className={thNum}>DT thuần</th>
                <th className={thCls}>Tỷ trọng</th>
                <th className={thNum}>Số HĐ</th>
                <th className={thNum}>TB/HĐ</th>
                <th className={thNum}>Trả hàng</th>
                <th className={thNum}>Lợi nhuận</th>
                <th className={thNum}>Biên LN</th>
                {compareLabel && <th className={thNum}>So với {compareLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {data.branches.map((b) => (
                <tr key={b.branchId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{b.name}</span>
                    <span className="ml-1 text-xs text-slate-400">{b.code}</span>
                    {b.status !== "active" && (
                      <span className="ml-1 text-xs text-slate-400">(ngừng)</span>
                    )}
                  </td>
                  <td className={`${tdNum} font-medium`}>{fmtMoney(b.net)}</td>
                  <td className="min-w-32 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${Math.max(0, b.share)}%`, background: SERIES.current }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-slate-600 tabular-nums">
                        {fmtNumber(b.share)}%
                      </span>
                    </div>
                  </td>
                  <td className={tdNum}>{b.invoices}</td>
                  <td className={tdNum}>{b.invoices ? fmtMoney(b.avgPerInvoice) : "—"}</td>
                  <td className={tdNum}>{b.refunds ? fmtMoney(b.refunds) : "—"}</td>
                  <td className={tdNum}>{fmtMoney(b.profit)}</td>
                  <td className={tdNum}>{b.margin === null ? "—" : `${fmtNumber(b.margin)}%`}</td>
                  {compareLabel && (
                    <td className={tdNum}>
                      <Change value={b.netChange} />
                    </td>
                  )}
                </tr>
              ))}
              {data.branches.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400">
                    Không có chi nhánh
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
