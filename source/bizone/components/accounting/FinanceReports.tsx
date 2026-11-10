"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, fmtNumber, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, useLoad } from "@/components/staff/shared";
import { CompareBarChart, KpiTile, Panel, tdNum, thCls, thNum } from "@/components/reports/shared";
import { cn } from "@/lib/utils";
import { AccountingHeader, PeriodPicker, signed, usePeriod, type Outputs } from "./shared";

type Pnl = Outputs["accounting"]["profitLoss"];
type Flow = Outputs["accounting"]["cashFlow"];

/** Báo cáo lời lỗ + báo cáo dòng tiền (SRS-ACC-04) */
export function FinanceReports({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const period = usePeriod("thisMonth");
  const [tab, setTab] = useState<"pnl" | "flow">("pnl");
  const input = { from: period.range.from, to: period.range.to };
  const key = JSON.stringify({ ...input, tab });
  const data = useLoad<{ tab: "pnl"; d: Pnl } | { tab: "flow"; d: Flow }>(key, () =>
    tab === "pnl"
      ? trpc.accounting.profitLoss.query(input, ctx).then((d) => ({ tab: "pnl" as const, d }))
      : trpc.accounting.cashFlow.query(input, ctx).then((d) => ({ tab: "flow" as const, d })),
  );

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Báo cáo lời lỗ (doanh thu − chi phí) và dòng tiền thực thu / chi"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist">
          {(
            [
              ["pnl", "Lời lỗ"],
              ["flow", "Dòng tiền"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "h-9 rounded-md px-4 text-sm font-medium",
                tab === k ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <PeriodPicker period={period} />
      </div>
      <ErrorBox message={data.error} />
      {data.data?.tab === "pnl" && <ProfitLoss d={data.data.d} />}
      {data.data?.tab === "flow" && <CashFlow d={data.data.d} />}
      {data.loading && !data.data && <p className="text-sm text-slate-500">Đang tải…</p>}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  indent,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
  tone?: "pos" | "neg";
}) {
  return (
    <tr className={cn(strong && "bg-slate-50 font-semibold")}>
      <td className={cn("px-3 py-2", indent && "pl-8 text-slate-600")}>{label}</td>
      <td
        className={cn(
          tdNum,
          tone === "neg" && "text-red-600",
          tone === "pos" && "text-emerald-700",
        )}
      >
        {tone === "neg" && value ? `(${fmtMoney(value)})` : fmtMoney(value)}
      </td>
    </tr>
  );
}

function ProfitLoss({ d }: { d: Pnl }) {
  const s = d.summary;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Doanh thu" value={fmtMoney(s.revenue)} />
        <KpiTile label="Chi phí (giá vốn + chi phí)" value={fmtMoney(s.totalCost)} />
        <KpiTile label="Lợi nhuận" value={signed(s.netProfit)} />
        <KpiTile
          label="Tỷ suất lợi nhuận"
          value={s.netMargin === null ? "—" : `${fmtNumber(s.netMargin)}%`}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <Panel title="Báo cáo kết quả kinh doanh">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <Row label="1. Doanh thu bán hàng (gộp)" value={d.sales.gross} />
                  <Row label="Chiết khấu hoá đơn" value={d.sales.discount} indent tone="neg" />
                  <Row label="Hàng bán bị trả lại" value={d.sales.refunds} indent tone="neg" />
                  <Row label="2. Doanh thu thuần bán hàng" value={s.netSales} strong />
                  <Row label="3. Giá vốn hàng bán" value={s.cogs} tone="neg" />
                  <Row label="4. Lợi nhuận gộp (2 − 3)" value={s.grossProfit} strong />
                  <Row label="5. Thu nhập khác" value={s.otherIncome} />
                  {d.otherIncome.map((l) => (
                    <Row key={`i${l.categoryId}`} label={l.name} value={l.amount} indent />
                  ))}
                  <Row label="6. Chi phí hoạt động" value={s.expenses} tone="neg" />
                  {d.expenses.map((l) => (
                    <Row key={`e${l.categoryId}`} label={l.name} value={l.amount} indent />
                  ))}
                  <tr className="bg-slate-100 font-bold">
                    <td className="px-3 py-2.5">7. Lợi nhuận thuần (4 + 5 − 6)</td>
                    <td
                      className={cn(tdNum, s.netProfit < 0 ? "text-red-600" : "text-emerald-700")}
                    >
                      {signed(s.netProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {d.sales.noCostLines > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                {d.sales.noCostLines} dòng hàng chưa có giá vốn — lợi nhuận có thể cao hơn thực tế.
              </p>
            )}
          </Panel>
        </div>
        <div className="space-y-5 xl:col-span-3">
          <Panel title="Doanh thu và chi phí theo thời gian">
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
          <Panel title="Không tính vào lời lỗ">
            {d.excluded.length === 0 ? (
              <p className="text-sm text-slate-500">Không có.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {d.excluded.map((l) => (
                    <tr key={`${l.type}${l.categoryId}`}>
                      <td className="px-3 py-2">
                        {l.name}{" "}
                        <span className="text-xs text-slate-500">
                          ({l.type === "revenue" ? "thu" : "chi"})
                        </span>
                      </td>
                      <td className={tdNum}>{fmtMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Thu nợ khách, thu tiền bán hàng (doanh thu đã tính theo hoá đơn) và tiền nhập hàng
              (tính vào giá vốn khi bán) chỉ ảnh hưởng dòng tiền.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function CashFlow({ d }: { d: Flow }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Tiền vào" value={fmtMoney(d.totalIn)} />
        <KpiTile label="Tiền ra" value={fmtMoney(d.totalOut)} />
        <KpiTile label="Dòng tiền thuần" value={signed(d.net)} />
        <KpiTile
          label={`Số dư quỹ cuối kỳ (đầu kỳ ${fmtMoney(d.funds.opening)})`}
          value={fmtMoney(d.funds.closing)}
        />
      </div>
      <Panel title="Tiền vào / tiền ra theo thời gian">
        <CompareBarChart
          points={d.series.points.map((p) => ({ key: p.key, value: p.in, compare: p.out }))}
          label="Tiền vào"
          compareLabel="Tiền ra"
        />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <FlowTable title="Tiền vào" rows={d.inflows} total={d.totalIn} />
        <FlowTable title="Tiền ra" rows={d.outflows} total={d.totalOut} />
      </div>
      <Panel title="Số dư quỹ đầu kỳ / cuối kỳ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className={thCls}>Quỹ</th>
                <th className={thNum}>Đầu kỳ</th>
                <th className={thNum}>Cuối kỳ</th>
                <th className={thNum}>Thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.funds.items.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2">{f.name}</td>
                  <td className={tdNum}>{fmtMoney(f.opening)}</td>
                  <td className={tdNum}>{fmtMoney(f.closing)}</td>
                  <td className={tdNum}>{signed(f.closing - f.opening)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tiền bán hàng POS chỉ vào quỹ khi nộp tiền ca (trang Quỹ &amp; sổ quỹ); chuyển khoản / thẻ
          / QR vào tài khoản ngân hàng cần ghi nhận bằng phiếu thu hoặc chuyển quỹ.
        </p>
      </Panel>
    </div>
  );
}

function FlowTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Flow["inflows"];
  total: number;
}) {
  return (
    <Panel title={title}>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.group}${r.label}`}>
              <td className="px-3 py-2">
                {r.label}
                {r.group === "record" && (
                  <span className="ml-1 text-xs text-slate-500">(sổ thu chi)</span>
                )}
              </td>
              <td className={tdNum}>{fmtMoney(r.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-center text-slate-400" colSpan={2}>
                Không có
              </td>
            </tr>
          )}
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2">Tổng</td>
            <td className={tdNum}>{fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}
