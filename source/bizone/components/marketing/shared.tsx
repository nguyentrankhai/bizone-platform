"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { inputCls, useLoad } from "@/components/staff/shared";
import { cn } from "@/lib/utils";

export type Outputs = inferRouterOutputs<AppRouter>;

const TABS = [
  { href: "/marketing", label: "Mã giảm giá", exact: true },
  { href: "/marketing/vouchers", label: "Voucher" },
  { href: "/marketing/flash-sales", label: "Flash sale" },
  { href: "/marketing/promotions", label: "Mua X tặng Y & Combo" },
  { href: "/marketing/campaigns", label: "Chiến dịch SMS/Email" },
  { href: "/marketing/report", label: "Hiệu quả" },
];

export function MarketingNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Marketing">
      <div className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
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

export function MarketingHeader({
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
      <MarketingNav />
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "amber" | "slate" | "red" | "blue";
  children: React.ReactNode;
}) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        cls,
      )}
    >
      {children}
    </span>
  );
}

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Instant → "10/11/2026 14:00" in Vietnam time */
export function fmtDT(v: Date | string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("vi-VN", {
    timeZone: VN_TZ,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Instant → value for <input type="datetime-local"> in Vietnam time ("2026-11-10T14:00") */
export function toLocalInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  return new Date(new Date(v).getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}

/** Now + `minutes` as a datetime-local value (VN time) */
export function localIn(minutes: number): string {
  return toLocalInput(new Date(Date.now() + minutes * 60_000));
}

export const RANKING_LABEL: Record<string, string> = {
  silver: "Bạc",
  gold: "Vàng",
  vip: "VIP",
  diamond: "Kim cương",
};

export function money(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : fmtMoney(v);
}

export interface PickedProduct {
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  price: number;
}

/** Search box listing products and their variants; calls onPick for the chosen row */
export function ProductPicker({
  auth,
  onPick,
  placeholder = "Tìm sản phẩm theo tên, SKU, mã vạch…",
  withVariants = true,
}: {
  auth: ApiAuth;
  onPick: (p: PickedProduct) => void;
  placeholder?: string;
  withVariants?: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickedProduct[]>([]);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (!term) return;
    timer.current = setTimeout(() => {
      trpc.productSearch.search
        .query({ q: term, limit: 15, status: "active" }, apiContext(auth))
        .then(
          (res) =>
            setRows(
              res.flatMap((p) => [
                {
                  productId: p.id,
                  variantId: null,
                  name: p.name,
                  sku: p.sku,
                  price: Number(p.sellingPrice),
                },
                ...(withVariants
                  ? p.productVariants.map((v) => ({
                      productId: p.id,
                      variantId: v.id,
                      name: `${p.name} (${v.sku})`,
                      sku: v.sku,
                      price: Number(v.sellingPrice) || Number(p.sellingPrice),
                    }))
                  : []),
              ]),
            ),
          (e: unknown) => setError(errorMessage(e)),
        );
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auth is stable per page
  }, [q, withVariants]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className={`${inputCls} pl-9`}
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value.trim()) setRows([]);
        }}
        aria-label={placeholder}
      />
      {q.trim() && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {error && <p className="px-3 py-2 text-sm text-red-600">{error}</p>}
          {!error && rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">Không tìm thấy</p>
          )}
          {rows.map((r) => (
            <button
              key={`${r.productId}:${r.variantId ?? 0}`}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onPick(r);
                setQ("");
                setRows([]);
              }}
            >
              <span>
                <span className="font-medium text-slate-800">{r.name}</span>
                <span className="ml-2 text-xs text-slate-500">{r.sku}</span>
              </span>
              <span className="text-xs text-slate-600 tabular-nums">{fmtMoney(r.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface CategoryOption {
  id: number;
  label: string;
}

/** Flattened category tree ("Bánh kẹo › Bánh quy") for selects */
export function useCategoryOptions(auth: ApiAuth): CategoryOption[] {
  const tree = useLoad("cat-tree", () => trpc.category.tree.query(undefined, apiContext(auth)));
  const out: CategoryOption[] = [];
  type Node = { id: number; name: string; children: Node[] };
  const walk = (nodes: Node[], prefix: string) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: prefix ? `${prefix} › ${n.name}` : n.name });
      walk(n.children, prefix ? `${prefix} › ${n.name}` : n.name);
    }
  };
  walk((tree.data ?? []) as Node[], "");
  return out;
}
