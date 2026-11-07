"use client";

import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import {
  Change,
  CompareBarChart,
  KpiTile,
  METHOD_LABEL,
  Panel,
  ShareBars,
  dayOrMonthLabel,
  tdNum,
  thCls,
  thNum,
} from "./shared";

type Revenue = RouterOutputs["reports"]["revenue"];

export function RevenueReport({
  data,
  compareLabel,
}: {
  data: Revenue;
  compareLabel: string | null;
}) {
  const s = data.summary;
  const hint = compareLabel ? `so với ${compareLabel}` : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Doanh thu"
          value={fmtMoney(s.current.gross)}
          change={s.change?.gross}
          hint={hint}
        />
        <KpiTile
          label="Chiết khấu"
          value={fmtMoney(s.current.discount)}
          change={s.change?.discount}
          hint={hint}
        />
        <KpiTile
          label="Doanh thu thuần"
          value={fmtMoney(s.current.net)}
          change={s.change?.net}
          hint={hint}
        />
        <KpiTile
          label="Số hoá đơn"
          value={fmtNumber(s.current.invoices)}
          change={s.change?.invoices}
          hint={`TB ${fmtMoney(s.current.avgPerInvoice)}/HĐ`}
        />
      </div>
      {s.current.refunds > 0 && (
        <p className="text-sm text-slate-500">
          Đã trừ trả hàng {fmtMoney(s.current.refunds)} khỏi doanh thu thuần.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title={`Doanh thu thuần theo ${data.series.unit === "day" ? "ngày" : "tháng"}`}>
            <CompareBarChart
              label="Kỳ này"
              compareLabel={compareLabel ? `Kỳ so sánh (${compareLabel})` : null}
              points={data.series.points.map((p) => ({
                key: p.key,
                value: p.net,
                compare: p.compareNet,
                compareKey: p.compareKey,
              }))}
            />
          </Panel>
        </div>
        <Panel title="Theo phương thức thanh toán">
          {data.paymentMethods ? (
            data.paymentMethods.length ? (
              <ShareBars
                rows={data.paymentMethods.map((m) => ({
                  label: METHOD_LABEL[m.method] ?? m.method,
                  value: m.amount,
                  percent: m.percent,
                }))}
              />
            ) : (
              <p className="text-sm text-slate-400">Chưa có thanh toán</p>
            )
          ) : (
            <p className="text-sm text-slate-500">
              Không tách được theo danh mục — bỏ lọc danh mục để xem.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Chi tiết theo kỳ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>{data.series.unit === "day" ? "Ngày" : "Tháng"}</th>
                <th className={thNum}>Doanh thu</th>
                <th className={thNum}>Chiết khấu</th>
                <th className={thNum}>Trả hàng</th>
                <th className={thNum}>DT thuần</th>
                <th className={thNum}>Số HĐ</th>
                <th className={thNum}>TB/HĐ</th>
                {compareLabel && <th className={thNum}>So với {compareLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {data.series.points.map((p) => (
                <tr key={p.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{dayOrMonthLabel(p.key)}</td>
                  <td className={tdNum}>{fmtMoney(p.gross)}</td>
                  <td className={tdNum}>{fmtMoney(p.discount)}</td>
                  <td className={tdNum}>{p.refunds ? fmtMoney(p.refunds) : "—"}</td>
                  <td className={`${tdNum} font-medium`}>{fmtMoney(p.net)}</td>
                  <td className={tdNum}>{p.invoices}</td>
                  <td className={tdNum}>{p.invoices ? fmtMoney(p.avgPerInvoice) : "—"}</td>
                  {compareLabel && (
                    <td className={tdNum}>
                      <Change value={p.change} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Theo danh mục">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Danh mục</th>
                <th className={thNum}>SL bán</th>
                <th className={thNum}>DT thuần</th>
                <th className={thNum}>Số HĐ</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((c) => (
                <tr key={c.categoryId ?? "none"} className="border-t border-slate-100">
                  <td className="px-3 py-2">{c.name}</td>
                  <td className={tdNum}>{fmtNumber(c.qty)}</td>
                  <td className={tdNum}>{fmtMoney(c.net)}</td>
                  <td className={tdNum}>{c.invoices}</td>
                </tr>
              ))}
              {data.byCategory.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Không có doanh thu trong kỳ
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
