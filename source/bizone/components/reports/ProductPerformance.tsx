"use client";

import Link from "next/link";
import { fmtMoney, fmtNumber, type RouterOutputs } from "@/components/inventory/shared";
import { Panel, tdNum, thCls, thNum } from "./shared";

type Products = RouterOutputs["reports"]["products"];

export function ProductPerformance({ data }: { data: Products }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Top 10 bán chạy">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>#</th>
                <th className={thCls}>Sản phẩm</th>
                <th className={thNum}>SL bán</th>
                <th className={thNum}>DT thuần</th>
              </tr>
            </thead>
            <tbody>
              {data.bestSelling.map((p, i) => (
                <tr key={p.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="max-w-60 truncate px-3 py-2">
                    <Link href={`/products/${p.productId}`} className="hover:text-primary">
                      {p.name}
                    </Link>
                    <span className="ml-1 text-xs text-slate-400">{p.sku}</span>
                  </td>
                  <td className={`${tdNum} font-medium`}>{fmtNumber(p.qty)}</td>
                  <td className={tdNum}>{fmtMoney(p.net)}</td>
                </tr>
              ))}
              {data.bestSelling.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Chưa bán được sản phẩm nào trong kỳ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Top 10 bán chậm (còn tồn kho)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={thCls}>Sản phẩm</th>
                <th className={thNum}>SL bán</th>
                <th className={thNum}>Tồn</th>
                <th className={thNum}>Giá trị tồn</th>
                <th className={thNum}>Chưa bán</th>
              </tr>
            </thead>
            <tbody>
              {data.slowMoving.map((p) => (
                <tr key={p.productId} className="border-t border-slate-100">
                  <td className="max-w-56 truncate px-3 py-2">
                    <Link href={`/products/${p.productId}`} className="hover:text-primary">
                      {p.name}
                    </Link>
                  </td>
                  <td className={tdNum}>{fmtNumber(p.qty)}</td>
                  <td className={tdNum}>{fmtNumber(p.stock)}</td>
                  <td className={tdNum}>{fmtMoney(p.stockValue)}</td>
                  <td className={tdNum}>
                    {p.daysSinceSale === null ? "chưa từng bán" : `${p.daysSinceSale} ngày`}
                  </td>
                </tr>
              ))}
              {data.slowMoving.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Không có hàng tồn
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
