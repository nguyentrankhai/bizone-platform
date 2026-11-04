"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, TrendingUp, TrendingDown, ShoppingCart, Users, Package, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  fmtMoney,
  fmtDate,
  errorMessage,
  type ApiAuth,
} from "@/components/inventory/shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type DashboardData = inferRouterOutputs<AppRouter>["dashboard"]["summary"];

interface Props {
  auth: ApiAuth;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("vi-VN");
}

function RevenueBar({ revenue7d }: { revenue7d: DashboardData["revenue7d"] }) {
  const max = Math.max(...revenue7d.map((d) => d.revenue), 1);
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  return (
    <div className="flex items-end gap-1.5 h-36 pt-2">
      {revenue7d.map((d, i) => {
        const pct = (d.revenue / max) * 100;
        const dow = new Date(d.date).getDay();
        const label = days[dow];
        const isToday = d.date === new Date().toISOString().slice(0, 10);
        return (
          <div key={d.date} className="relative flex flex-1 flex-col items-center">
            <div className="mb-5 text-xs text-slate-400 whitespace-nowrap">
              {d.revenue > 0 ? fmtCompact(d.revenue) : ""}
            </div>
            <div
              className={`w-full rounded-t-sm min-h-2 transition-all ${isToday ? "bg-blue-600" : "bg-blue-200"}`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <div className={`mt-1.5 text-xs ${isToday ? "font-semibold text-blue-600" : "text-slate-400"}`}>
              {label}
              {i === revenue7d.length - 1 && <span className="ml-1 text-blue-500">•</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentPie({ breakdown }: { breakdown: DashboardData["paymentBreakdown"] }) {
  const total = breakdown.reduce((s, p) => s + p.amount, 0);
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
  if (total === 0) {
    return <div className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu hôm nay</div>;
  }
  return (
    <div className="space-y-2">
      {breakdown.map((p, i) => {
        const pct = total > 0 ? (p.amount / total) * 100 : 0;
        return (
          <div key={p.method} className="flex items-center gap-2 text-sm">
            <div
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: colors[i % colors.length] }}
            />
            <span className="flex-1 text-slate-600">{p.label}</span>
            <span className="font-medium text-slate-700">{fmtMoney(p.amount)}</span>
            <span className="w-10 text-right text-xs text-slate-400">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardClient({ auth }: Props) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await trpc.dashboard.summary.query(undefined, ctx);
        setData(result);
        setLastUpdated(new Date());
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-56 rounded-xl bg-slate-100 md:col-span-2" />
          <div className="h-56 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { todayStats, revenue7d, topProducts, paymentBreakdown, pendingOrders, lowStock } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard tổng quan</h1>
          {lastUpdated && (
            <p className="mt-0.5 text-xs text-slate-400">
              Cập nhật lúc {lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Cache 5 phút
            </p>
          )}
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Revenue */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <ShoppingCart className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-xs text-slate-500">Doanh thu hôm nay</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">
            {fmtCompact(todayStats.revenue)}đ
          </div>
          {todayStats.revenueChange !== null && (
            <div className={`mt-1 flex items-center gap-1 text-xs ${todayStats.revenueChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {todayStats.revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(todayStats.revenueChange)}% so với hôm qua
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
            <ShoppingCart className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-xs text-slate-500">Hóa đơn hôm nay</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{todayStats.invoiceCount}</div>
          <div className="mt-1 text-xs text-slate-400">đơn POS</div>
        </div>

        {/* New customers */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Users className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-xs text-slate-500">Khách hàng mới</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{todayStats.newCustomers}</div>
          <div className="mt-1 text-xs text-slate-400">hôm nay</div>
        </div>

        {/* Low stock */}
        <div className={`rounded-xl border p-5 ${todayStats.lowStockCount > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${todayStats.lowStockCount > 0 ? "bg-amber-100" : "bg-slate-50"}`}>
            <AlertTriangle className={`h-5 w-5 ${todayStats.lowStockCount > 0 ? "text-amber-600" : "text-slate-400"}`} />
          </div>
          <div className="text-xs text-slate-500">Cảnh báo tồn kho</div>
          <div className={`mt-1 text-2xl font-bold ${todayStats.lowStockCount > 0 ? "text-amber-700" : "text-slate-800"}`}>
            {todayStats.lowStockCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">sản phẩm sắp hết</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {/* Revenue 7 days */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 md:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Doanh thu 7 ngày</div>
            <span className="text-xs text-slate-400">
              Tổng: {fmtMoney(revenue7d.reduce((s, d) => s + d.revenue, 0))}
            </span>
          </div>
          <RevenueBar revenue7d={revenue7d} />
        </div>

        {/* Payment breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Phương thức thanh toán</div>
          <PaymentPie breakdown={paymentBreakdown} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top products */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">
            Top sản phẩm bán chạy <span className="font-normal text-slate-400">(7 ngày)</span>
          </div>
          {topProducts.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu</div>
          ) : (
            <div className="space-y-1">
              {topProducts.map((p) => {
                const rankColors = ["bg-amber-100 text-amber-700", "bg-slate-100 text-slate-600", "bg-orange-100 text-orange-700"];
                return (
                  <div key={p.productId} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-bold ${rankColors[p.rank - 1] ?? "bg-slate-50 text-slate-400"}`}>
                      {p.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.sku}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-700">{fmtMoney(p.revenue)}</div>
                      <div className="text-xs text-slate-400">{p.quantity} cái</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending orders + low stock */}
        <div className="space-y-4">
          {/* Pending orders */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Đơn hàng chờ xử lý</div>
              {pendingOrders.length > 0 && (
                <button
                  onClick={() => router.push("/orders?status=pending")}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Xem tất cả
                </button>
              )}
            </div>
            {pendingOrders.length === 0 ? (
              <div className="py-4 text-center text-sm text-slate-400">Không có đơn chờ xử lý</div>
            ) : (
              <div className="space-y-1">
                {pendingOrders.map((o) => {
                  const ord = o as typeof o & { customer?: { fullName?: string } | null };
                  return (
                    <div
                      key={o.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                      onClick={() => router.push(`/orders/${o.id}`)}
                    >
                      <Package className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-blue-600">{o.orderCode}</div>
                        <div className="truncate text-xs text-slate-400">{ord.customer?.fullName ?? "Khách lẻ"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{fmtMoney(o.totalAmount)}</div>
                        <div className="text-xs text-slate-400">{fmtDate(o.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Low stock */}
          {lowStock.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  Cảnh báo tồn kho thấp
                </div>
                <button
                  onClick={() => router.push("/warehouse")}
                  className="text-xs text-amber-700 hover:underline"
                >
                  Xem kho
                </button>
              </div>
              <div className="space-y-1">
                {lowStock.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 truncate text-slate-700">{item.name}</div>
                    <span className="font-semibold text-red-600">{item.quantity}</span>
                    <span className="text-xs text-slate-400">/ min {item.minQuantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
