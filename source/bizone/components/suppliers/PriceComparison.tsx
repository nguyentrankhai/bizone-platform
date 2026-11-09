"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  fmtDate,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
} from "@/components/inventory/shared";
import { ErrorBox, inputAutoCls, inputCls, useLoad } from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { SupplierPageHeader } from "./shared";

/**
 * Net purchase price of each product per supplier (last / min / avg). `supplierId` limits to
 * products that supplier sells; `minSuppliers` 2 = only products with something to compare.
 */
export function PriceComparisonTable({
  auth,
  supplierId,
  minSuppliers: initialMin = 2,
}: {
  auth: ApiAuth;
  supplierId?: number;
  minSuppliers?: number;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [minSuppliers, setMinSuppliers] = useState(initialMin);
  const input = {
    ...(query ? { search: query } : {}),
    ...(supplierId ? { supplierId } : {}),
    minSuppliers,
    limit: 50,
  };
  const data = useLoad(JSON.stringify(input), () =>
    trpc.supplier.priceComparison.query(input, apiContext(auth)),
  );
  const groups = data.data ?? [];

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Tên sản phẩm, SKU… (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm sản phẩm"
          />
        </div>
        <select
          className={inputAutoCls}
          value={minSuppliers}
          onChange={(e) => setMinSuppliers(Number(e.target.value))}
          aria-label="Số nhà cung cấp"
        >
          <option value={2}>Sản phẩm có ≥ 2 nhà cung cấp</option>
          <option value={1}>Mọi sản phẩm đã nhập</option>
        </select>
      </form>
      <p className="text-xs text-slate-500">
        Giá nhập sau chiết khấu dòng, lấy từ các đơn nhập không huỷ (đơn huỷ chỉ tính dòng đã nhận
        hàng). Nhà cung cấp xếp theo giá lần nhập gần nhất; % là mức đắt hơn nhà cung cấp rẻ nhất.
      </p>
      <ErrorBox message={data.error} />
      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-400">
          {data.loading ? "Đang tải…" : "Chưa có dữ liệu giá nhập để so sánh"}
        </p>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <section
            key={`${g.productId}:${g.variantId ?? 0}`}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="font-semibold text-slate-800">{g.name}</h3>
                <p className="text-xs text-slate-500">
                  {g.sku}
                  {g.unit && <> · {g.unit}</>}
                </p>
              </div>
              {g.suppliers.length > 1 && g.spread > 0 && (
                <p className="text-xs text-slate-600">
                  Chênh lệch rẻ nhất – đắt nhất: <strong>{fmtMoney(g.spread)}</strong>/
                  {g.unit ?? "đv"}
                </p>
              )}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm [&_td]:whitespace-nowrap [&_td:first-child]:min-w-48 [&_td:first-child]:whitespace-normal [&_th]:whitespace-nowrap">
                <thead className="text-left text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">Nhà cung cấp</th>
                    <th className="px-4 py-2 text-right">Giá gần nhất</th>
                    <th className="px-4 py-2 text-right">So với rẻ nhất</th>
                    <th className="px-4 py-2 text-right">Thấp / TB / Cao</th>
                    <th className="px-4 py-2 text-right">SL đã đặt</th>
                    <th className="px-4 py-2">Lần gần nhất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.suppliers.map((s) => (
                    <tr
                      key={s.supplierId}
                      className={cn(s.isCheapest && g.suppliers.length > 1 && "bg-emerald-50/50")}
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/suppliers/${s.supplierId}`}
                          className="font-medium text-slate-800 hover:text-primary"
                        >
                          {s.name}
                        </Link>
                        {s.isCheapest && g.suppliers.length > 1 && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                            Rẻ nhất
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {fmtMoney(s.lastCost)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          s.diffPercent > 0 ? "text-red-600" : "text-slate-400",
                        )}
                      >
                        {s.diffPercent > 0 ? `+${fmtNumber(s.diffPercent)}%` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                        {fmtMoney(s.minCost)} / {fmtMoney(s.avgCost)} / {fmtMoney(s.maxCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtNumber(s.totalQty)}
                        <span className="text-xs text-slate-500"> ({s.poCount} đơn)</span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{fmtDate(s.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PriceComparisonPage({ auth }: { auth: ApiAuth }) {
  return (
    <div className="space-y-5">
      <SupplierPageHeader
        title="So sánh giá nhập"
        subtitle="Giá nhập cùng một sản phẩm giữa các nhà cung cấp"
      />
      <PriceComparisonTable auth={auth} />
    </div>
  );
}
