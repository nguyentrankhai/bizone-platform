"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, inputAutoCls, inputCls, useLoad } from "@/components/staff/shared";
import { EMPTY_SUPPLIER, SupplierForm } from "./SupplierForm";
import { Pager, SupplierPageHeader } from "./shared";

export function SupplierTable({ auth }: { auth: ApiAuth }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("active");
  const [debt, setDebt] = useState<"" | "owing" | "overdue">("");
  const [adding, setAdding] = useState(false);

  const input = {
    page,
    pageSize: 20,
    ...(query ? { search: query } : {}),
    ...(status ? { isActive: status === "active" } : {}),
    ...(debt ? { debt } : {}),
  };
  const list = useLoad(JSON.stringify(input), () =>
    trpc.supplier.list.query(input, apiContext(auth)),
  );
  const rows = list.data?.items ?? [];
  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);

  return (
    <div className="space-y-5">
      <SupplierPageHeader
        title="Nhà cung cấp"
        subtitle="Thông tin nhà cung cấp, đơn nhập hàng, công nợ phải trả"
        actions={
          <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Thêm nhà cung cấp
          </button>
        }
      />

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Tên, mã, SĐT, MST, người liên hệ… (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm nhà cung cấp"
          />
        </div>
        <select
          className={inputAutoCls}
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as typeof status);
          }}
          aria-label="Trạng thái hợp tác"
        >
          <option value="active">Đang hợp tác</option>
          <option value="inactive">Ngừng hợp tác</option>
          <option value="">Tất cả</option>
        </select>
        <select
          className={inputAutoCls}
          value={debt}
          onChange={(e) => {
            setPage(1);
            setDebt(e.target.value as typeof debt);
          }}
          aria-label="Công nợ"
        >
          <option value="">Mọi công nợ</option>
          <option value="owing">Còn nợ</option>
          <option value="overdue">Có nợ quá hạn</option>
        </select>
      </form>

      <ErrorBox message={list.error} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Nhà cung cấp</th>
                <th className="px-4 py-3">Liên hệ</th>
                <th className="px-4 py-3">Điều khoản</th>
                <th className="px-4 py-3 text-right">Đơn nhập</th>
                <th className="px-4 py-3 text-right">Còn nợ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Đang tải…
                  </td>
                </tr>
              )}
              {!list.loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Chưa có nhà cung cấp phù hợp
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(`/suppliers/${s.id}`)}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/suppliers/${s.id}`}
                      className="font-medium text-slate-800 hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {s.code}
                      {s.taxCode && <> · MST {s.taxCode}</>}
                      {!s.isActive && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          Ngừng hợp tác
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{s.contactPerson || "—"}</div>
                    <div className="text-xs text-slate-500">{s.phone || s.email || ""}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.paymentTerms || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.poCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className={s.owed > 0 ? "font-semibold text-slate-800" : "text-slate-400"}>
                      {fmtMoney(s.owed)}
                    </div>
                    {s.overdue > 0 && (
                      <div className="text-xs font-medium text-red-600">
                        Quá hạn {fmtMoney(s.overdue)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/purchase-orders/new?supplier=${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-sm font-medium text-primary hover:underline ${s.isActive ? "" : "pointer-events-none opacity-40"}`}
                      aria-disabled={!s.isActive}
                    >
                      Tạo đơn nhập
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={4} className="px-4 py-2 text-right text-slate-500">
                    Tổng còn nợ (trang này)
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {fmtMoney(totalOwed)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
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

      {adding && (
        <SupplierForm
          auth={auth}
          initial={EMPTY_SUPPLIER}
          onClose={() => setAdding(false)}
          onSaved={(id) => router.push(`/suppliers/${id}`)}
        />
      )}
    </div>
  );
}
