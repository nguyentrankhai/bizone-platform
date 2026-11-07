"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/components/inventory/shared";
import { cn } from "@/lib/utils";

export const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-50 text-red-700",
  manager: "bg-blue-50 text-blue-700",
  seller: "bg-emerald-50 text-emerald-700",
  warehouse: "bg-amber-50 text-amber-700",
  viewer: "bg-slate-100 text-slate-700",
};

export function roleBadgeClass(code: string): string {
  return ROLE_BADGE[code] ?? "bg-violet-50 text-violet-700";
}

const TABS = [
  { href: "/staff", label: "Nhân viên" },
  { href: "/staff/shifts", label: "Ca làm việc" },
  { href: "/staff/attendance", label: "Chấm công" },
  { href: "/staff/commissions", label: "Hoa hồng" },
  { href: "/staff/roles", label: "Phân quyền" },
];

export function StaffNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Quản lý nhân viên">
      <div className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.href === "/staff" ? pathname === "/staff" : pathname?.startsWith(t.href);
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

export function StaffPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <StaffNav />
    </div>
  );
}

/**
 * Load data for a key (JSON of the query input). `loading` is derived from the key the last
 * answer belongs to, so the effect never sets state synchronously; `reload` re-runs it.
 */
export function useLoad<T>(key: string, load: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const fullKey = `${key}#${nonce}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setResult({ key: fullKey, data }),
      (e: unknown) => !cancelled && setResult({ key: fullKey, error: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey]); // eslint-disable-line react-hooks/exhaustive-deps -- fullKey covers the inputs

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result?.key !== fullKey;
  return {
    // keep showing the previous data while reloading
    data: result?.data,
    error: loading ? "" : (result?.error ?? ""),
    loading,
    reload,
  };
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none";
/** Same look as inputCls but sized to content (selects / month pickers in toolbars) */
export const inputAutoCls = inputCls.replace("w-full", "w-auto");
export const btnPrimary =
  "inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50";
export const btnSecondary =
  "inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Current VN date as YYYY-MM-DD */
export function vnToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing `key` */
export function weekStart(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

export function fmtMinutes(min: number): string {
  if (!min) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}p`;
}

export function fmtTime(v: Date | string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}
