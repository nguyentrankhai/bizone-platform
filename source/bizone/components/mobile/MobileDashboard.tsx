"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Package, Receipt, UserPlus, Wallet } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney } from "@/components/inventory/shared";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { cn } from "@/lib/utils";
import { InstallPrompt } from "./InstallPrompt";
import {
  Card,
  Change,
  DataStatus,
  Empty,
  MiniBars,
  Skeleton,
  fmtClock,
  fmtCompact,
} from "./shared";
import { useApiAuth } from "@/components/auth/AuthProvider";

type Summary = inferRouterOutputs<AppRouter>["dashboard"]["summary"];

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Owner dashboard on the phone (P6.4): today's numbers, 7-day revenue, orders and stock alerts */
export function MobileDashboard() {
  const auth = useApiAuth();
  const q = useOfflineQuery<Summary>(
    auth,
    "dashboard",
    () => trpc.dashboard.summary.query(undefined, apiContext(auth)),
    30_000,
  );
  const d = q.data;

  return (
    <div>
      <InstallPrompt dismissible />
      <h1 className="text-xl font-bold text-slate-900">Hôm nay</h1>
      <DataStatus {...q} onRefresh={() => void q.refresh()} />

      {!d ? (
        q.loading ? (
          <Skeleton rows={4} />
        ) : null
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat
              icon={Wallet}
              tone="blue"
              label="Doanh thu"
              value={`${fmtCompact(d.todayStats.revenue)}₫`}
              sub={<Change value={d.todayStats.revenueChange} suffix="so với hôm qua" />}
            />
            <Stat
              icon={Receipt}
              tone="green"
              label="Hoá đơn"
              value={String(d.todayStats.invoiceCount)}
              sub={<span className="text-xs text-slate-400">hôm nay</span>}
            />
            <Stat
              icon={UserPlus}
              tone="violet"
              label="Khách mới"
              value={String(d.todayStats.newCustomers)}
            />
            <Stat
              icon={AlertTriangle}
              tone={d.todayStats.lowStockCount > 0 ? "amber" : "slate"}
              label="Sắp hết hàng"
              value={String(d.todayStats.lowStockCount)}
              href="#low-stock"
            />
          </div>

          <Card
            title="Doanh thu 7 ngày"
            action={
              <span className="text-xs text-slate-500">
                {fmtMoney(d.revenue7d.reduce((s, x) => s + x.revenue, 0))}
              </span>
            }
          >
            <MiniBars
              highlight={d.revenue7d.at(-1)?.date /* today */}
              points={d.revenue7d.map((x) => ({
                key: x.date,
                label: WEEKDAY[new Date(`${x.date}T00:00:00Z`).getUTCDay()],
                value: x.revenue,
              }))}
            />
          </Card>

          <Card
            title={`Đơn chờ xử lý (${d.pendingOrders.length})`}
            action={
              <Link
                href="/mobile/orders?status=pending"
                className="-mr-2 flex h-9 items-center px-2 text-xs font-medium text-primary"
              >
                Xem tất cả
              </Link>
            }
          >
            {d.pendingOrders.length === 0 ? (
              <Empty>Không có đơn chờ xử lý</Empty>
            ) : (
              <ul className="-mx-2">
                {d.pendingOrders.slice(0, 5).map((o) => {
                  const ord = o as typeof o & { customer?: { fullName?: string } | null };
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/mobile/orders/${o.id}`}
                        className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 active:bg-slate-50"
                      >
                        <Package className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800">
                            {o.orderCode}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {ord.customer?.fullName ?? "Khách lẻ"} ·{" "}
                            {fmtClock(new Date(o.createdAt).getTime())}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-slate-700">
                          {fmtMoney(o.totalAmount)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Thanh toán hôm nay">
            {d.paymentBreakdown.length === 0 ? (
              <Empty>Chưa có thanh toán</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.paymentBreakdown.map((p) => (
                  <li key={p.method} className="flex justify-between gap-2">
                    <span className="text-slate-600">{p.label}</span>
                    <span className="font-medium text-slate-800">{fmtMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div id="low-stock" className="scroll-mt-20">
            <Card
              title="Cảnh báo tồn kho"
              className={d.lowStock.length ? "border-amber-200 bg-amber-50" : undefined}
            >
              {d.lowStock.length === 0 ? (
                <Empty>Không có sản phẩm sắp hết</Empty>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.lowStock.map((s) => (
                    <li key={s.productId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-slate-700">{s.name}</span>
                      <span className="font-semibold text-red-600">{s.quantity}</span>
                      <span className="text-xs text-slate-400">/ tối thiểu {s.minQuantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-100 text-slate-400",
} as const;

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ElementType;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-2 block text-xs text-slate-500">{label}</span>
      <span className="block text-2xl font-bold text-slate-900">{value}</span>
      {sub}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-4";
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
