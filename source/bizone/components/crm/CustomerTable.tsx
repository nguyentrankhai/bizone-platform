"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  fmtMoney,
  fmtDate,
  errorMessage,
  type ApiAuth,
} from "@/components/inventory/shared";
import { RANKING } from "./shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type CustomerRow = inferRouterOutputs<AppRouter>["customer"]["list"]["items"][number];

interface Props {
  auth: ApiAuth;
}

export function CustomerTable({ auth }: Props) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [ranking, setRanking] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Add customer modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ fullName: "", phone: "", email: "" });
  const [adding, setAdding] = useState(false);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.customer.list.query(
        {
          page,
          limit: 20,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(ranking && {
            ranking: ranking as "silver" | "gold" | "vip" | "diamond",
          }),
        },
        ctx,
      );
      setCustomers(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, ranking]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await trpc.customer.exportExcel.mutate(
        {
          page: 1,
          limit: 100,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(ranking && { ranking: ranking as "silver" | "gold" | "vip" | "diamond" }),
        },
        ctx,
      );
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
      link.download = `khach-hang-${Date.now()}.xlsx`;
      link.click();
      toast.success("Xuất Excel thành công");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleAdd() {
    if (!addForm.fullName || !addForm.phone) {
      toast.error("Vui lòng nhập tên và SĐT");
      return;
    }
    setAdding(true);
    try {
      await trpc.customer.create.mutate({ ...addForm, debtLimit: 0 }, ctx);
      toast.success("Thêm khách hàng thành công");
      setShowAdd(false);
      setAddForm({ fullName: "", phone: "", email: "" });
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Khách hàng</h1>
          <p className="mt-0.5 text-sm text-slate-500">Quản lý hồ sơ và tích điểm khách hàng</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Thêm khách hàng
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="relative max-w-80 min-w-52 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
              placeholder="Tìm theo tên, SĐT, email..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={ranking}
            onChange={(e) => { setRanking(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả xếp hạng</option>
            {Object.entries(RANKING).map(([v, r]) => (
              <option key={v} value={v}>{r.label}</option>
            ))}
          </select>

          <button
            className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Khách hàng</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">SĐT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nhóm</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Xếp hạng</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Điểm</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Tổng chi tiêu</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Lần mua</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">Đang tải...</td>
                </tr>
              )}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">Không có khách hàng nào</td>
                </tr>
              )}
              {customers.map((c) => {
                const initials = c.fullName
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();
                const rank = RANKING[c.ranking];
                const group = (c as { group?: { name?: string } }).group;
                const counts = (c as { _count?: { invoices?: number; orders?: number } })._count;
                const purchases = (counts?.invoices ?? 0) + (counts?.orders ?? 0);

                return (
                  <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{c.fullName}</div>
                          <div className="text-xs text-slate-400">{c.email ?? c.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{c.phone}</td>
                    <td className="px-4 py-3">
                      {group ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {group.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rank && (
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${rank.className}`}>
                          {rank.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                      {c.totalPoints.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">
                      {fmtMoney(c.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{purchases}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/crm/${c.id}`)}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
          <span>
            Hiển thị {customers.length > 0 ? (page - 1) * 20 + 1 : 0}–{(page - 1) * 20 + customers.length} của {total} khách
          </span>
          <div className="flex gap-1">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button
                  key={p}
                  className={`h-8 w-8 rounded-lg border text-sm ${p === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              );
            })}
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Thêm khách hàng mới</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Họ tên *</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Nhập họ tên"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">SĐT *</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Nhập số điện thoại"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Nhập email (không bắt buộc)"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3 justify-end">
              <button
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setShowAdd(false)}
              >
                Huỷ
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void handleAdd()}
                disabled={adding}
              >
                {adding ? "Đang lưu..." : "Thêm khách hàng"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
