"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { cn } from "@/lib/utils";

export type Outputs = inferRouterOutputs<AppRouter>;

export const PO_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Chờ nhập", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  partial: { label: "Đã nhập 1 phần", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  received: { label: "Đã nhập", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Đã huỷ", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const DEBT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Chưa trả", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  partial: { label: "Trả 1 phần", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  paid: { label: "Đã trả", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  overdue: { label: "Quá hạn", className: "bg-red-50 text-red-700 ring-red-200" },
};

export const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: "Chuyển khoản",
  cash: "Tiền mặt",
  card: "Thẻ",
  other: "Khác",
};

export function Badge({
  map,
  value,
}: {
  map: Record<string, { label: string; className: string }>;
  value: string;
}) {
  const s = map[value] ?? { label: value, className: "bg-slate-100 text-slate-600 ring-slate-200" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

const TABS = [
  { href: "/suppliers", label: "Nhà cung cấp", exact: true },
  { href: "/purchase-orders", label: "Đơn nhập hàng" },
  { href: "/suppliers/prices", label: "So sánh giá nhập" },
];

export function SupplierNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Nhà cung cấp">
      <div className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.exact
            ? pathname === t.href || (/^\/suppliers\/\d+/.test(pathname) && t.href === "/suppliers")
            : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SupplierPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <SupplierNav />
    </div>
  );
}

/** Simple « page / total » pager */
export function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{total} dòng</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-9 rounded-md border border-slate-300 px-3 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </button>
        <span>
          {page}/{totalPages}
        </span>
        <button
          type="button"
          className="h-9 rounded-md border border-slate-300 px-3 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}

/** Today as YYYY-MM-DD in Vietnam time (matches server business days) */
export function vnToday(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function fmtDay(key: string | null | undefined): string {
  if (!key) return "—";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}
