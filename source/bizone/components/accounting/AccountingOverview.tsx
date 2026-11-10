"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, fmtNumber, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, useLoad } from "@/components/staff/shared";
import { CompareBarChart, KpiTile, Panel } from "@/components/reports/shared";
import { AccountingHeader, PeriodPicker, signed, usePeriod } from "./shared";

/** Tổng quan kế toán: lời lỗ kỳ, thu chi, số dư quỹ, công nợ */
export function AccountingOverview({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const period = usePeriod("thisMonth");
  const input = { from: period.range.from, to: period.range.to };
  const data = useLoad(JSON.stringify(input), () => trpc.accounting.overview.query(input, ctx));
  const d = data.data;

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Quỹ tiền, thu chi, công nợ và kết quả kinh doanh của cửa hàng"
      />
      <PeriodPicker period={period} />
      <ErrorBox message={data.error} />
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Doanh thu" value={fmtMoney(d.pnl.revenue)} />
            <KpiTile label="Chi phí (gồm giá vốn)" value={fmtMoney(d.pnl.totalCost)} />
            <KpiTile label="Lợi nhuận" value={signed(d.pnl.netProfit)} />
            <KpiTile
              label="Tỷ suất lợi nhuận"
              value={d.pnl.netMargin === null ? "—" : `${fmtNumber(d.pnl.netMargin)}%`}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel
                title="Doanh thu và chi phí"
                action={
                  <Link href="/accounting/reports" className="text-sm text-primary hover:underline">
                    Báo cáo lời lỗ →
                  </Link>
                }
              >
                <CompareBarChart
                  points={d.series.points.map((p) => ({
                    key: p.key,
                    value: p.revenue,
                    compare: p.cost,
                  }))}
                  label="Doanh thu"
                  compareLabel="Chi phí"
                />
              </Panel>
            </div>
            <div className="space-y-5">
              <Panel
                title="Số dư quỹ hiện tại"
                action={
                  <Link
                    href="/accounting/cash-funds"
                    className="text-sm text-primary hover:underline"
                  >
                    Sổ quỹ →
                  </Link>
                }
              >
                <dl className="space-y-2 text-sm">
                  <Line label="Tiền mặt" value={fmtMoney(d.funds.cash)} />
                  <Line label="Ngân hàng" value={fmtMoney(d.funds.bank)} />
                  <Line
                    label={`Tổng (${d.funds.count} quỹ)`}
                    value={fmtMoney(d.funds.cash + d.funds.bank)}
                    strong
                  />
                </dl>
              </Panel>
              <Panel
                title="Thu chi trong kỳ"
                action={
                  <Link href="/accounting/records" className="text-sm text-primary hover:underline">
                    Sổ thu chi →
                  </Link>
                }
              >
                <dl className="space-y-2 text-sm">
                  <Line
                    label={`Phiếu thu (${d.receipts.count})`}
                    value={fmtMoney(d.receipts.amount)}
                  />
                  <Line
                    label={`Phiếu chi (${d.payments.count})`}
                    value={fmtMoney(d.payments.amount)}
                  />
                </dl>
              </Panel>
              <Panel
                title="Công nợ"
                action={
                  <Link href="/accounting/debts" className="text-sm text-primary hover:underline">
                    Chi tiết →
                  </Link>
                }
              >
                <dl className="space-y-2 text-sm">
                  <Line
                    label="Phải thu khách hàng"
                    value={fmtMoney(d.debts.receivable)}
                    hint={
                      d.debts.receivableOverdue
                        ? `quá hạn ${fmtMoney(d.debts.receivableOverdue)}`
                        : undefined
                    }
                  />
                  <Line
                    label="Phải trả nhà cung cấp"
                    value={fmtMoney(d.debts.payable)}
                    hint={
                      d.debts.payableOverdue
                        ? `quá hạn ${fmtMoney(d.debts.payableOverdue)}`
                        : undefined
                    }
                  />
                </dl>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd
        className={
          strong ? "font-semibold text-slate-800 tabular-nums" : "text-slate-800 tabular-nums"
        }
      >
        {value}
        {hint && <span className="block text-right text-xs text-red-600">{hint}</span>}
      </dd>
    </div>
  );
}
