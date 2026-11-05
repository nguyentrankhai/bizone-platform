"use client";

import type { MethodSlice, SummaryBlock } from "@/lib/dashboard";
import { fmtInt, fmtVndShort } from "./dashboard-format";

/** Donut charts: payment methods (SRS-PH-DASH-01-03) and success/failure (SRS-PH-DASH-01-04). */

const METHOD_COLORS: Record<string, string> = {
  VNPay: "#2563EB",
  MoMo: "#D82D8B",
  VietQR: "#8B5CF6",
  ZaloPay: "#0EA5E9",
  "Chưa chọn": "#9CA3AF",
};
const FALLBACK_COLORS = ["#F59E0B", "#14B8A6", "#EF4444", "#6366F1", "#84CC16"];

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  detail?: string;
}

const R = 60;
const C = 2 * Math.PI * R;

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  testId,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  testId?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row" data-testid={testId}>
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label={centerLabel}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="#F3F4F6" strokeWidth="22" />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                >
                  <title>{`${s.label}: ${fmtInt(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        <text x="80" y="76" textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827">
          {centerValue}
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#6B7280">
          {centerLabel}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-start gap-2" data-slice={s.label}>
            <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-gray-700">{s.label}</span>
                <span className="shrink-0 font-medium text-gray-600 tabular-nums">
                  {total ? `${((s.value / total) * 100).toFixed(1)}%` : "0%"}
                </span>
              </span>
              {s.detail && <span className="block text-xs text-gray-400">{s.detail}</span>}
            </span>
          </li>
        ))}
        {slices.length === 0 && <li className="text-gray-400">Chưa có giao dịch</li>}
      </ul>
    </div>
  );
}

export function PaymentMethodPie({ slices }: { slices: MethodSlice[] }) {
  let fallback = 0;
  const data: DonutSlice[] = slices.map((s) => ({
    label: s.method,
    value: s.count,
    color: METHOD_COLORS[s.method] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length],
    detail: `${fmtInt(s.count)} GD · ${fmtVndShort(s.amount)}`,
  }));
  const total = slices.reduce((a, s) => a + s.count, 0);
  return (
    <DonutChart
      testId="method-pie"
      slices={data}
      centerValue={fmtInt(total)}
      centerLabel="giao dịch"
    />
  );
}

export function SuccessRatePie({ summary }: { summary: SummaryBlock }) {
  const success = summary.paid - summary.refunded;
  const slices: DonutSlice[] = [
    { label: "Thành công", value: success, color: "#10B981", detail: `${fmtInt(success)} GD` },
    {
      label: "Đã hoàn tiền",
      value: summary.refunded,
      color: "#A78BFA",
      detail: `${fmtInt(summary.refunded)} GD`,
    },
    {
      label: "Thất bại",
      value: summary.failed - summary.expired,
      color: "#EF4444",
      detail: `${fmtInt(summary.failed - summary.expired)} GD`,
    },
    {
      label: "Hết hạn",
      value: summary.expired,
      color: "#9CA3AF",
      detail: `${fmtInt(summary.expired)} GD`,
    },
    {
      label: "Đang xử lý",
      value: summary.pending,
      color: "#F59E0B",
      detail: `${fmtInt(summary.pending)} GD`,
    },
  ];
  return (
    <DonutChart
      testId="success-pie"
      slices={slices}
      centerValue={summary.successRate === null ? "—" : `${summary.successRate}%`}
      centerLabel="thành công"
    />
  );
}
