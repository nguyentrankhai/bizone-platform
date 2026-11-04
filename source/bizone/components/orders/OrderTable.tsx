"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  fmtMoney,
  fmtDate,
  errorMessage,
  type ApiAuth,
} from "@/components/inventory/shared";
import { ORDER_STATUS, PAYMENT_STATUS, CHANNEL_LABEL } from "./shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type OrderRow = inferRouterOutputs<AppRouter>["order"]["list"]["items"][number];

interface OrderTableProps {
  auth: ApiAuth;
}

export function OrderTable({ auth }: OrderTableProps) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "">("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  }

  function getDateFilter() {
    const now = new Date();
    if (dateRange === "today") {
      return { dateFrom: now.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
    }
    if (dateRange === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { dateFrom: d.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
    }
    if (dateRange === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { dateFrom: d.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
    }
    return {};
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.order.list.query(
        {
          page,
          limit: 20,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(channel && { channel }),
          ...(status && {
            status: status as
              | "pending"
              | "confirmed"
              | "preparing"
              | "shipping"
              | "delivered"
              | "completed"
              | "cancelled"
              | "returned",
          }),
          ...getDateFilter(),
        },
        ctx,
      );
      setOrders(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, channel, status, dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await trpc.order.exportExcel.mutate(
        {
          page: 1,
          limit: 100,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(channel && { channel }),
          ...(status && {
            status: status as
              | "pending"
              | "confirmed"
              | "preparing"
              | "shipping"
              | "delivered"
              | "completed"
              | "cancelled"
              | "returned",
          }),
          ...getDateFilter(),
        },
        ctx,
      );
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
      link.download = `don-hang-${Date.now()}.xlsx`;
      link.click();
      toast.success("Xuất Excel thành công");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
        <div className="relative max-w-80 min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
            placeholder="Tìm theo mã đơn, tên/SĐT..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả kênh</option>
          {Object.entries(CHANNEL_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(ORDER_STATUS).map(([v, s]) => (
            <option key={v} value={v}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={dateRange}
          onChange={(e) => {
            setDateRange(e.target.value as typeof dateRange);
            setPage(1);
          }}
        >
          <option value="">Tất cả thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="week">7 ngày qua</option>
          <option value="month">30 ngày qua</option>
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Mã đơn
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Khách hàng
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Sản phẩm
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                Tổng tiền
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Kênh
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Ngày
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Trạng thái
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Thanh toán
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                  Đang tải...
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                  Không có đơn hàng nào
                </td>
              </tr>
            )}
            {orders.map((order) => {
              const customer = order.customer;
              const items = order.orderItems as Array<{ product?: { name?: string } }>;
              const count = (order._count as { orderItems?: number })?.orderItems ?? items.length;
              const preview = items
                .slice(0, 2)
                .map((i) => i.product?.name ?? "SP")
                .join(", ");
              const statusInfo = ORDER_STATUS[order.status];
              const payInfo = PAYMENT_STATUS[order.paymentStatus];

              return (
                <tr key={order.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-blue-600">{order.orderCode}</span>
                  </td>
                  <td className="px-4 py-3">
                    {customer ? (
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {customer.fullName}
                        </div>
                        <div className="text-xs text-slate-400">{customer.phone}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">Khách lẻ</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">
                      {preview}
                      {count > 2 && <span className="text-slate-400"> +{count - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-slate-800">
                      {fmtMoney(order.totalAmount)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {CHANNEL_LABEL[order.channel ?? ""] ?? order.channel ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">{fmtDate(order.createdAt)}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(order.createdAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {statusInfo && (
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payInfo && (
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${payInfo.className}`}
                      >
                        {payInfo.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/orders/${order.id}`)}
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
          Hiển thị {orders.length > 0 ? (page - 1) * 20 + 1 : 0}–{(page - 1) * 20 + orders.length}{" "}
          của {total} đơn
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
  );
}
