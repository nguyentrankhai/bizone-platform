"use client";

import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import { Change, KpiTile, Panel, tdNum, thCls, thNum } from "./shared";

type Promotion = RouterOutputs["reports"]["promotion"];
type Inventory = RouterOutputs["reports"]["inventory"];

const dmy = (k: string) => `${k.slice(8)}/${k.slice(5, 7)}`;

export function PromotionReport({ data }: { data: Promotion }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="DT/ngày trong KM so với trước"
          value={
            data.upliftDuring === null
              ? "—"
              : `${data.upliftDuring > 0 ? "+" : ""}${fmtNumber(data.upliftDuring)}%`
          }
        />
        <KpiTile
          label="DT/ngày sau KM so với trước"
          value={
            data.upliftAfter === null
              ? "—"
              : `${data.upliftAfter > 0 ? "+" : ""}${fmtNumber(data.upliftAfter)}%`
          }
        />
        <KpiTile label="Lượt dùng mã giảm giá" value={fmtNumber(data.couponUsage.count)} />
        <KpiTile label="Tiền giảm qua mã" value={fmtMoney(data.couponUsage.discount)} />
      </div>
      <Panel title={`Trước / trong / sau khuyến mãi (mỗi giai đoạn ${data.windowDays} ngày)`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Giai đoạn</th>
                <th className={thCls}>Thời gian</th>
                <th className={thNum}>DT thuần</th>
                <th className={thNum}>DT/ngày</th>
                <th className={thNum}>HĐ/ngày</th>
                <th className={thNum}>Chiết khấu</th>
                <th className={thNum}>So với trước KM</th>
              </tr>
            </thead>
            <tbody>
              {data.windows.map((w) => (
                <tr key={w.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{w.label}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {w.days ? `${dmy(w.from)} – ${dmy(w.to)}` : "chưa tới"}
                    {w.days > 0 && !w.complete && (
                      <span className="ml-1 text-xs text-amber-700">({w.days} ngày)</span>
                    )}
                  </td>
                  <td className={tdNum}>{fmtMoney(w.net)}</td>
                  <td className={`${tdNum} font-medium`}>{fmtMoney(w.netPerDay)}</td>
                  <td className={tdNum}>{fmtNumber(w.invoicesPerDay)}</td>
                  <td className={tdNum}>{fmtMoney(w.discount)}</td>
                  <td className={tdNum}>
                    {w.key === "before" ? (
                      "—"
                    ) : (
                      <Change value={w.key === "during" ? data.upliftDuring : data.upliftAfter} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          So sánh doanh thu bình quân mỗi ngày; giai đoạn “sau” chưa trọn vẹn được tính trên số ngày
          đã qua.
        </p>
      </Panel>
    </div>
  );
}

export function InventoryReport({ data }: { data: Inventory }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Giá trị tồn kho" value={fmtMoney(data.totalValue)} />
        <KpiTile label="Tổng số lượng" value={fmtNumber(data.totalQuantity)} />
        <KpiTile label="Mặt hàng sắp hết" value={fmtNumber(data.lowStock.length)} />
        <KpiTile
          label="Lô quá hạn / sắp hết hạn"
          value={`${data.expired.length} / ${data.expiring.length}`}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Giá trị theo kho">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Kho</th>
                <th className={thNum}>Mã còn hàng</th>
                <th className={thNum}>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {data.warehouses.map((w) => (
                <tr key={w.warehouseId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{w.name}</td>
                  <td className={tdNum}>{w.skus}</td>
                  <td className={`${tdNum} font-medium`}>{fmtMoney(w.value)}</td>
                </tr>
              ))}
              {data.warehouses.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    Chưa có kho
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
        <Panel title="Hàng sắp hết">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className={thCls}>Sản phẩm</th>
                  <th className={thCls}>Kho</th>
                  <th className={thNum}>Tồn / tối thiểu</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((r) => (
                  <tr key={`${r.productId}-${r.warehouse}`} className="border-t border-slate-100">
                    <td className="max-w-52 truncate px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600">{r.warehouse}</td>
                    <td
                      className={`${tdNum} ${r.quantity <= 0 ? "text-red-600" : "text-amber-700"}`}
                    >
                      {fmtNumber(r.quantity)} / {r.minQuantity}
                    </td>
                  </tr>
                ))}
                {data.lowStock.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      Không có mặt hàng dưới mức tối thiểu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel title="Lô quá hạn và sắp hết hạn">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Sản phẩm</th>
                <th className={thCls}>Kho</th>
                <th className={thCls}>Lô</th>
                <th className={thNum}>SL</th>
                <th className={thCls}>HSD</th>
                <th className={thNum}>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {[...data.expired, ...data.expiring].map((b) => (
                <tr
                  key={`${b.batchCode}-${b.productId}-${b.warehouse}`}
                  className="border-t border-slate-100"
                >
                  <td className="max-w-52 truncate px-3 py-2">{b.name}</td>
                  <td className="px-3 py-2 text-slate-600">{b.warehouse}</td>
                  <td className="px-3 py-2">{b.batchCode}</td>
                  <td className={tdNum}>{fmtNumber(b.quantity)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {b.expiryDate.split("-").reverse().join("/")}{" "}
                    <span className={b.daysLeft < 0 ? "text-red-600" : "text-amber-700"}>
                      ({b.daysLeft < 0 ? `quá ${-b.daysLeft} ngày` : `còn ${b.daysLeft} ngày`})
                    </span>
                  </td>
                  <td className={tdNum}>{fmtMoney(b.value)}</td>
                </tr>
              ))}
              {data.expired.length + data.expiring.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Không có lô quá hạn hoặc sắp hết hạn
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
