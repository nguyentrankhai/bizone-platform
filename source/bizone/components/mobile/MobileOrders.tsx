"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney } from "@/components/inventory/shared";
import { ORDER_STATUS, PAYMENT_STATUS, channelLabel } from "@/components/orders/shared";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { cn } from "@/lib/utils";
import type { ListOrdersInput } from "@/lib/validators/order";
import { DataStatus, Empty, Skeleton, fmtClock } from "./shared";
import { useApiAuth } from "@/components/auth/AuthProvider";

type OrderPage = inferRouterOutputs<AppRouter>["order"]["list"];
type OrderRow = OrderPage["items"][number];
type Status = NonNullable<ListOrdersInput["status"]>;

const FILTERS: { value: Status | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "pending", label: "Chờ xác nhận" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "preparing", label: "Đang chuẩn bị" },
  { value: "shipping", label: "Đang giao" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã huỷ" },
];
const PAGE_SIZE = 20;

/** Order list on the phone (P6.4): status chips, search, "Tải thêm"; first page kept offline */
export function MobileOrders() {
  const auth = useApiAuth();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status") ?? "";
  const status = (FILTERS.some((f) => f.value === initial) ? initial : "") as Status | "";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [more, setMore] = useState<{ key: string; pages: OrderPage[] }>({ key: "", pages: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const input = {
    page: 1,
    limit: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  };
  const name = `orders:${status}:${search}`;
  const q = useOfflineQuery<OrderPage>(auth, name, () =>
    trpc.order.list.query(input, apiContext(auth)),
  );

  const extra = more.key === name ? more.pages : [];
  const rows: OrderRow[] = [...(q.data?.items ?? []), ...extra.flatMap((p) => p.items)];
  const lastPage = extra.at(-1) ?? q.data;
  const hasMore = !!lastPage && lastPage.page < lastPage.totalPages;

  async function loadMore() {
    if (!lastPage) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await trpc.order.list.query(
        { ...input, page: lastPage.page + 1 },
        apiContext(auth),
      );
      setMore({ key: name, pages: [...extra, next] });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold text-slate-900">Đơn hàng</h1>

      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          inputMode="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Mã đơn, tên hoặc SĐT khách"
          aria-label="Tìm đơn hàng"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <div
        className="-mx-4 mb-3 overflow-x-auto px-4"
        role="tablist"
        aria-label="Lọc theo trạng thái"
      >
        <div className="flex min-w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() =>
                router.replace(f.value ? `/mobile/orders?status=${f.value}` : "/mobile/orders", {
                  scroll: false,
                })
              }
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm whitespace-nowrap",
                status === f.value
                  ? "border-primary bg-primary text-white"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <DataStatus {...q} onRefresh={() => void q.refresh()} />

      {!q.data && q.loading && <Skeleton rows={5} />}
      {q.data && rows.length === 0 && <Empty>Không có đơn hàng phù hợp</Empty>}

      <ul className="space-y-2">
        {rows.map((o) => (
          <li key={o.id}>
            <OrderCard order={o} />
          </li>
        ))}
      </ul>

      {q.data && (
        <p className="mt-3 text-center text-xs text-slate-400">
          {rows.length}/{q.data.total} đơn
        </p>
      )}
      {moreError && <p className="mt-2 text-center text-xs text-red-600">{moreError}</p>}
      {hasMore && !q.stale && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 h-11 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {loadingMore ? "Đang tải…" : "Tải thêm"}
        </button>
      )}
    </div>
  );
}

function OrderCard({ order: o }: { order: OrderRow }) {
  const st = ORDER_STATUS[o.status];
  const pay = PAYMENT_STATUS[o.paymentStatus];
  const items = o.orderItems.map((i) => i.product?.name).filter(Boolean);
  const moreItems = o._count.orderItems - items.length;
  return (
    <Link
      href={`/mobile/orders/${o.id}`}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{o.orderCode}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          {st && (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
                st.className,
              )}
            >
              {st.label}
            </span>
          )}
          <span className="truncate">
            {o.customer?.fullName ?? o.contactName ?? "Khách lẻ"} · {channelLabel(o)}
          </span>
        </div>
        {items.length > 0 && (
          <div className="mt-0.5 truncate text-xs text-slate-400">
            {items.join(", ")}
            {moreItems > 0 ? ` +${moreItems}` : ""}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-slate-800">{fmtMoney(o.totalAmount)}</div>
        {pay && (
          <div
            className={cn(
              "mt-0.5 inline-block rounded px-1.5 text-[11px] whitespace-nowrap",
              pay.className,
            )}
          >
            {pay.label}
          </div>
        )}
        <div className="text-[11px] text-slate-400">
          {fmtClock(new Date(o.createdAt).getTime())}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}
