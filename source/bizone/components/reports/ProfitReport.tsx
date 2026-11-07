"use client";

import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import { CompareBarChart, KpiTile, Panel, tdNum, thCls, thNum } from "./shared";

type Profit = RouterOutputs["reports"]["profit"];
type ProductRow = Profit["topProfit"][number];

function ProductTable({ rows }: { rows: ProductRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className={thCls}>Sản phẩm</th>
            <th className={thNum}>SL</th>
            <th className={thNum}>DT thuần</th>
            <th className={thNum}>Lợi nhuận</th>
            <th className={thNum}>Biên</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} className="border-t border-slate-100">
              <td className="max-w-56 truncate px-3 py-2" title={`${r.name} (${r.sku})`}>
                {r.name}
              </td>
              <td className={tdNum}>{fmtNumber(r.qty)}</td>
              <td className={tdNum}>{fmtMoney(r.net)}</td>
              <td className={`${tdNum} ${r.profit < 0 ? "text-red-600" : ""}`}>
                {fmtMoney(r.profit)}
              </td>
              <td className={tdNum}>{r.margin === null ? "—" : `${fmtNumber(r.margin)}%`}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-400">
                Không có dữ liệu
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ProfitReport({
  data,
  compareLabel,
}: {
  data: Profit;
  compareLabel: string | null;
}) {
  const s = data.summary;
  const hint = compareLabel ? `so với ${compareLabel}` : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Doanh thu thuần"
          value={fmtMoney(s.current.net)}
          change={s.change?.net}
          hint={hint}
        />
        <KpiTile label="Giá vốn hàng bán" value={fmtMoney(s.current.cost)} />
        <KpiTile
          label="Lợi nhuận gộp"
          value={fmtMoney(s.current.profit)}
          change={s.change?.profit}
          hint={hint}
        />
        <KpiTile
          label="Biên lợi nhuận"
          value={s.current.margin === null ? "—" : `${fmtNumber(s.current.margin)}%`}
          change={s.change?.margin}
          changeSuffix=" điểm %"
          hint={hint}
        />
      </div>
      {s.current.noCostLines > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {s.current.noCostLines} dòng hàng chưa có giá vốn — lợi nhuận của các dòng này đang tính
          bằng toàn bộ doanh thu.
        </p>
      )}
      <Panel title={`Lợi nhuận gộp theo ${data.series.unit === "day" ? "ngày" : "tháng"}`}>
        <CompareBarChart
          label="Kỳ này"
          compareLabel={compareLabel ? `Kỳ so sánh (${compareLabel})` : null}
          points={data.series.points.map((p) => ({
            key: p.key,
            value: p.profit,
            compare: p.compareProfit,
            compareKey: p.compareKey,
          }))}
        />
      </Panel>
      <Panel title="Lợi nhuận theo danh mục">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Danh mục</th>
                <th className={thNum}>DT thuần</th>
                <th className={thNum}>Giá vốn</th>
                <th className={thNum}>Lợi nhuận gộp</th>
                <th className={thNum}>Biên LN</th>
                <th className={thNum}>SL đã bán</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((c) => (
                <tr key={c.categoryId ?? "none"} className="border-t border-slate-100">
                  <td className="px-3 py-2">{c.name}</td>
                  <td className={tdNum}>{fmtMoney(c.net)}</td>
                  <td className={tdNum}>{fmtMoney(c.cost)}</td>
                  <td className={`${tdNum} font-medium`}>{fmtMoney(c.profit)}</td>
                  <td className={tdNum}>{c.margin === null ? "—" : `${fmtNumber(c.margin)}%`}</td>
                  <td className={tdNum}>{fmtNumber(c.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top 10 lợi nhuận cao">
          <ProductTable rows={data.topProfit} />
        </Panel>
        <Panel title="Top 10 lợi nhuận thấp">
          <ProductTable rows={data.lowProfit} />
        </Panel>
      </div>
    </div>
  );
}
