"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { inputAutoCls, useLoad, vnToday } from "@/components/staff/shared";
import { presetRange } from "@/components/reports/ReportsClient";
import { cn } from "@/lib/utils";

export type Outputs = inferRouterOutputs<AppRouter>;
export type Fund = Outputs["accounting"]["funds"]["items"][number];
export type FundOption = Outputs["accounting"]["fundOptions"][number];
export type CategoryNode = Outputs["accounting"]["categories"][number];

const TABS = [
  { href: "/accounting", label: "Tổng quan", exact: true },
  { href: "/accounting/records", label: "Sổ thu chi" },
  { href: "/accounting/cash-funds", label: "Quỹ & sổ quỹ" },
  { href: "/accounting/debts", label: "Công nợ" },
  { href: "/accounting/reports", label: "Lời lỗ & dòng tiền" },
  { href: "/accounting/reconciliation", label: "Đối soát" },
  { href: "/accounting/categories", label: "Danh mục thu chi" },
];

export function AccountingNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Kế toán">
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

export function AccountingHeader({
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
      <AccountingNav />
    </div>
  );
}

/** Signed money: "+1.000.000 ₫" / "−200.000 ₫" */
export function signed(v: number) {
  if (!v) return fmtMoney(0);
  return `${v > 0 ? "+" : "−"}${fmtMoney(Math.abs(v))}`;
}

export function money(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : fmtMoney(v);
}

export const FUND_TYPE_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank: "Ngân hàng",
};

export const RECORD_TYPE_LABEL: Record<string, string> = {
  revenue: "Phiếu thu",
  expense: "Phiếu chi",
};

const PERIOD_PRESETS = [
  ["today", "Hôm nay"],
  ["7days", "7 ngày"],
  ["thisMonth", "Tháng này"],
  ["lastMonth", "Tháng trước"],
  ["thisQuarter", "Quý này"],
  ["thisYear", "Năm nay"],
] as const;
type PeriodPreset = (typeof PERIOD_PRESETS)[number][0] | "custom";

export interface Period {
  from: string;
  to: string;
}

export function usePeriod(initial: PeriodPreset = "thisMonth") {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [range, setRange] = useState<Period>(() =>
    presetRange(initial === "custom" ? "thisMonth" : initial, vnToday())!,
  );
  return { preset, setPreset, range, setRange };
}

/** Preset buttons + from/to dates (VN dates) */
export function PeriodPicker({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { preset, setPreset, range, setRange } = period;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={inputAutoCls}
        value={preset}
        aria-label="Khoảng thời gian"
        onChange={(e) => {
          const p = e.target.value as PeriodPreset;
          setPreset(p);
          const r = p === "custom" ? null : presetRange(p, vnToday());
          if (r) setRange(r);
        }}
      >
        {PERIOD_PRESETS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
        <option value="custom">Tuỳ chọn</option>
      </select>
      <input
        type="date"
        className={inputAutoCls}
        value={range.from}
        max={range.to}
        aria-label="Từ ngày"
        onChange={(e) => {
          if (!e.target.value) return;
          setPreset("custom");
          setRange({ ...range, from: e.target.value });
        }}
      />
      <span className="text-sm text-slate-400">→</span>
      <input
        type="date"
        className={inputAutoCls}
        value={range.to}
        min={range.from}
        aria-label="Đến ngày"
        onChange={(e) => {
          if (!e.target.value) return;
          setPreset("custom");
          setRange({ ...range, to: e.target.value });
        }}
      />
    </div>
  );
}

export function useFundOptions(auth: ApiAuth) {
  return useLoad("fund-options", () =>
    trpc.accounting.fundOptions.query(undefined, apiContext(auth)),
  );
}

/** Fund picker; `allowNone` adds "Không qua quỹ" */
export function FundSelect({
  funds,
  value,
  onChange,
  allowNone = true,
  noneLabel = "Không qua quỹ (chỉ ghi sổ)",
  id,
  exclude,
}: {
  funds: FundOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  id?: string;
  exclude?: number;
}) {
  return (
    <select
      id={id}
      className={inputAutoCls.replace("w-auto", "w-full")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {!allowNone && value === null && <option value="">— Chọn quỹ —</option>}
      {funds
        .filter((f) => f.id !== exclude)
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({FUND_TYPE_LABEL[f.type] ?? f.type}) — {fmtMoney(f.balance)}
          </option>
        ))}
    </select>
  );
}

export interface FlatCategory {
  id: number;
  label: string;
  type: "revenue" | "expense" | "both";
  isActive: boolean;
  depth: number;
}

/** Tree → indented options ("Chi phí › Điện") */
export function flattenCategories(nodes: CategoryNode[]): FlatCategory[] {
  const out: FlatCategory[] = [];
  const walk = (list: CategoryNode[], prefix: string, depth: number) => {
    for (const n of list) {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      out.push({ id: n.id, label, type: n.type, isActive: n.isActive, depth });
      walk(n.children as CategoryNode[], label, depth + 1);
    }
  };
  walk(nodes, "", 0);
  return out;
}

export function useCategories(auth: ApiAuth) {
  return useLoad("acc-categories", () =>
    trpc.accounting.categories.query(undefined, apiContext(auth)),
  );
}

export function Amount({ value, tone }: { value: number; tone?: "in" | "out" }) {
  const t = tone ?? (value >= 0 ? "in" : "out");
  return (
    <span className={cn("tabular-nums", t === "in" ? "text-emerald-700" : "text-red-600")}>
      {fmtMoney(Math.abs(value))}
    </span>
  );
}

/** Integer VND input shown with thousand separators ("1.250.000") */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0",
  autoFocus,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        autoFocus={autoFocus}
        className="h-10 w-full rounded-md border border-slate-300 bg-white pr-8 pl-3 text-right text-sm tabular-nums focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        placeholder={placeholder}
        value={value === null ? "" : value.toLocaleString("vi-VN")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
          onChange(digits ? Number(digits) : null);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
        ₫
      </span>
    </div>
  );
}
