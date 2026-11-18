"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** 1.2M / 350K — compact money for small cards */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("vi-VN");
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

interface StatusProps {
  savedAt: number | null;
  stale: boolean;
  error: string;
  loading: boolean;
  onRefresh: () => void;
}

/**
 * "Cập nhật lúc …" line + refresh button; when the last request failed it explains that the
 * numbers are the stored copy (offline) or shows the error when there is nothing stored.
 */
export function DataStatus({ savedAt, stale, error, loading, onRefresh }: StatusProps) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {savedAt
            ? `Cập nhật lúc ${fmtClock(savedAt)}`
            : loading
              ? "Đang tải…"
              : "Chưa có dữ liệu"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Làm mới"
          className="-mr-2 flex h-11 items-center gap-1.5 rounded-lg px-3 font-medium text-slate-600 hover:bg-white disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Làm mới
        </button>
      </div>
      {stale && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Không tải được dữ liệu mới — đang xem bản lưu lúc {savedAt ? fmtClock(savedAt) : "—"}.
            Số liệu sẽ tự cập nhật khi có mạng.
          </span>
        </div>
      )}
      {!stale && error && !loading && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function Card({
  title,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mb-4 rounded-xl border border-slate-200 bg-white p-4", className)}>
      {(title || action) && (
        <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Change({ value, suffix = "kỳ trước" }: { value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <span className={cn("text-xs", value >= 0 ? "text-emerald-600" : "text-red-500")}>
      {value >= 0 ? "▲" : "▼"} {Math.abs(value)}% {suffix}
    </span>
  );
}

/** Simple vertical bars (revenue by day) — no chart library on the phone */
export function MiniBars({
  points,
  highlight,
}: {
  points: { key: string; label: string; value: number }[];
  highlight?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const showLabels = points.length <= 12;
  return (
    <div className="flex h-28 items-end gap-1" role="img" aria-label="Biểu đồ doanh thu">
      {points.map((p) => (
        <div key={p.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <div
            title={`${p.label}: ${p.value.toLocaleString("vi-VN")}₫`}
            className={cn(
              "w-full rounded-t-sm",
              p.key === highlight ? "bg-primary" : "bg-blue-200",
            )}
            style={{ height: `${Math.max((p.value / max) * 100, 2)}%` }}
          />
          {showLabels && (
            <span
              className={cn(
                "mt-1 truncate text-[10px]",
                p.key === highlight ? "font-semibold text-primary" : "text-slate-400",
              )}
            >
              {p.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-400">{children}</p>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 rounded-xl bg-slate-200/70" />
      ))}
    </div>
  );
}
