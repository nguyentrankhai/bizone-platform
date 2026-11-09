"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtDate, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, inputAutoCls, inputCls, useLoad } from "@/components/staff/shared";
import { Badge, PO_STATUS, Pager, SupplierPageHeader } from "./shared";

type PoStatus = "pending" | "partial" | "received" | "cancelled";

/** PO table with status / search / date filters — standalone page or a supplier's tab */
export function PurchaseOrderTable({ auth, supplierId }: { auth: ApiAuth; supplierId?: number }) {
  const router = useRouter();
  const ctx = apiContext(auth);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | PoStatus>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState<number | "">(supplierId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const options = useLoad(supplierId ? "none" : "sup-options", () =>
    supplierId ? Promise.resolve([]) : trpc.supplier.options.query({ includeInactive: true }, ctx),
  );
  const input = {
    page,
    pageSize: 20,
    ...(status ? { status } : {}),
    ...(query ? { search: query } : {}),
    ...(supplier ? { supplierId: Number(supplier) } : {}),
    ...(from ? { dateFrom: from } : {}),
    ...(to ? { dateTo: to } : {}),
  };
  const list = useLoad(JSON.stringify(input), () => trpc.purchaseOrder.list.query(input, ctx));
  const rows = list.data?.items ?? [];
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setPage(1);
      fn(v);
    };

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder={
              supplierId ? "Mã đơn, ghi chú… (Enter)" : "Mã đơn, tên NCC, ghi chú… (Enter)"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm đơn nhập"
          />
        </div>
        {!supplierId && (
          <select
            className={inputAutoCls}
            value={supplier}
            onChange={(e) => reset(setSupplier)(e.target.value ? Number(e.target.value) : "")}
            aria-label="Nhà cung cấp"
          >
            <option value="">Tất cả nhà cung cấp</option>
            {(options.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select
          className={inputAutoCls}
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value as "" | PoStatus)}
          aria-label="Trạng thái"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(PO_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={inputAutoCls}
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
          aria-label="Từ ngày"
        />
        <input
          type="date"
          className={inputAutoCls}
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
          aria-label="Đến ngày"
        />
      </form>

      <ErrorBox message={list.error} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Mã đơn</th>
                {!supplierId && <th className="px-4 py-3">Nhà cung cấp</th>}
                <th className="px-4 py-3">Kho nhận</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Tiến độ nhận</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
                <th className="px-4 py-3 text-right">Còn nợ</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {list.loading ? "Đang tải…" : "Chưa có đơn nhập phù hợp"}
                  </td>
                </tr>
              )}
              {rows.map((po) => {
                const pct =
                  po.orderedQty > 0 ? Math.round((po.receivedQty / po.orderedQty) * 100) : 0;
                return (
                  <tr
                    key={po.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/purchase-orders/${po.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {po.poCode}
                      </Link>
                      <div className="text-xs text-slate-500">{po.itemCount} sản phẩm</div>
                    </td>
                    {!supplierId && (
                      <td className="px-4 py-3 text-slate-700">{po.supplier.name}</td>
                    )}
                    <td className="px-4 py-3 text-slate-600">{po.warehouse?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(po.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Tiến độ nhận hàng"
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {po.receivedQty}/{po.orderedQty}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {fmtMoney(po.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {po.remainingDebt > 0 ? (
                        fmtMoney(po.remainingDebt)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge map={PO_STATUS} value={po.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.data && (
          <Pager
            page={list.data.meta.page}
            totalPages={list.data.meta.totalPages}
            total={list.data.meta.total}
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}

export function PurchaseOrderList({ auth }: { auth: ApiAuth }) {
  return (
    <div className="space-y-5">
      <SupplierPageHeader
        title="Đơn nhập hàng"
        subtitle="Đặt hàng nhà cung cấp, nhận hàng vào kho (tự tạo phiếu nhập), theo dõi công nợ"
        actions={
          <Link href="/purchase-orders/new" className={btnPrimary}>
            <Plus className="h-4 w-4" /> Tạo đơn nhập
          </Link>
        }
      />
      <PurchaseOrderTable auth={auth} />
    </div>
  );
}
