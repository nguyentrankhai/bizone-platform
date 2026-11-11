"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  RANGE_PRESETS,
  presetRange,
  type DateRange,
  type RangePreset,
  type ReportFormat,
} from "@/lib/report";

/** Shared pieces of the report tabs (P5.5): period picker, selects, export buttons, stat card. */

export const selectCls =
  "h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";

export interface PeriodValue {
  preset: RangePreset;
  range: DateRange;
}

export function initialPeriod(today: string, preset: RangePreset = "7days"): PeriodValue {
  return { preset, range: presetRange(preset, today) };
}

export function PeriodPicker({
  id,
  today,
  value,
  onChange,
}: {
  id: string;
  today: string;
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`${id}-preset`}>
        Khoảng thời gian
      </label>
      <select
        id={`${id}-preset`}
        className={selectCls}
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as RangePreset;
          onChange({
            preset,
            range: preset === "custom" ? value.range : presetRange(preset, today),
          });
        }}
      >
        {Object.entries(RANGE_PRESETS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {value.preset === "custom" && (
        <>
          <label className="sr-only" htmlFor={`${id}-from`}>
            Từ ngày
          </label>
          <input
            id={`${id}-from`}
            type="date"
            className={selectCls}
            value={value.range.from}
            max={value.range.to}
            onChange={(e) =>
              e.target.value &&
              onChange({ preset: "custom", range: { ...value.range, from: e.target.value } })
            }
          />
          <span className="text-sm text-gray-400">–</span>
          <label className="sr-only" htmlFor={`${id}-to`}>
            Đến ngày
          </label>
          <input
            id={`${id}-to`}
            type="date"
            className={selectCls}
            value={value.range.to}
            min={value.range.from}
            max={today}
            onChange={(e) =>
              e.target.value &&
              onChange({ preset: "custom", range: { ...value.range, to: e.target.value } })
            }
          />
        </>
      )}
    </div>
  );
}

const FORMAT_META: Record<ReportFormat, { label: string; icon: typeof Download }> = {
  xlsx: { label: "Excel", icon: FileSpreadsheet },
  pdf: { label: "PDF", icon: FileText },
  csv: { label: "CSV", icon: Download },
};

export function ExportButtons({
  formats = ["xlsx", "pdf", "csv"],
  onExport,
  disabled,
}: {
  formats?: ReportFormat[];
  onExport: (f: ReportFormat) => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((f) => {
        const { label, icon: Icon } = FORMAT_META[f];
        return (
          <button
            key={f}
            type="button"
            disabled={disabled || busy !== null}
            onClick={async () => {
              setBusy(f);
              try {
                await onExport(f);
              } finally {
                setBusy(null);
              }
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === f ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "error" | "warning" | "primary";
}) {
  const color = {
    default: "text-gray-900",
    success: "text-emerald-600",
    error: "text-red-600",
    warning: "text-amber-600",
    primary: "text-blue-600",
  }[tone];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

/** "+12,5 %" green / "−3 %" red / "—". */
export function Growth({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-400">— {suffix}</span>;
  const up = value >= 0;
  return (
    <span className={up ? "text-emerald-600" : "text-red-600"}>
      {up ? "↑" : "↓"} {Math.abs(value).toLocaleString("vi-VN")} %{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

export function Card({
  title,
  action,
  children,
  bodyClass = "p-4",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
