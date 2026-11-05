"use client";

import { useState } from "react";
import type { ChartPoint } from "@/lib/dashboard";
import { fmtDay, fmtInt, fmtVnd, fmtVndShort } from "./dashboard-format";

/**
 * Daily trend (SRS-PH-DASH-01-02): line = number of transactions (left axis), area line =
 * paid amount (right axis). Plain SVG — no chart library — so the dashboard bundle stays small.
 */

const W = 720;
const H = 260;
const PAD = { top: 16, right: 64, bottom: 32, left: 44 };
const COUNT_COLOR = "#2563EB";
const AMOUNT_COLOR = "#10B981";

/** Rounds the axis max up to a "nice" number so the 4 grid lines get readable labels. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function RevenueChart({ data }: { data: ChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxCount = niceMax(Math.max(...data.map((d) => d.count), 4));
  const maxAmount = niceMax(Math.max(...data.map((d) => d.amount), 1));
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => PAD.left + (data.length > 1 ? i * step : innerW / 2);
  const yCount = (v: number) => PAD.top + innerH - (v / maxCount) * innerH;
  const yAmount = (v: number) => PAD.top + innerH - (v / maxAmount) * innerH;
  const countPath = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${yCount(d.count)}`).join(" ");
  const amountLine = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${yAmount(d.amount)}`).join(" ");
  const amountArea = `${amountLine} L${x(data.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const labelEvery = data.length > 10 ? Math.ceil(data.length / 8) : 1;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hover === null ? null : data[hover];
  const totalCount = data.reduce((a, d) => a + d.count, 0);

  return (
    <div className="relative" data-testid="revenue-chart">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: COUNT_COLOR }} /> Số GD
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm opacity-60" style={{ background: AMOUNT_COLOR }} />
          Tổng tiền thành công
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Biểu đồ ${data.length} ngày: ${fmtInt(totalCount)} giao dịch`}
        onMouseLeave={() => setHover(null)}
      >
        {grid.map((g) => {
          const y = PAD.top + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#E5E7EB" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6B7280">
                {fmtInt(Math.round(g * maxCount))}
              </text>
              <text x={W - PAD.right + 8} y={y + 4} fontSize="11" fill="#6B7280">
                {fmtVndShort(g * maxAmount).replace(" ₫", "")}
              </text>
            </g>
          );
        })}

        <path d={amountArea} fill={AMOUNT_COLOR} opacity={0.12} />
        <path d={amountLine} fill="none" stroke={AMOUNT_COLOR} strokeWidth={2} />
        <path d={countPath} fill="none" stroke={COUNT_COLOR} strokeWidth={2.5} />

        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={yCount(d.count)} r={hover === i ? 5 : 3} fill={COUNT_COLOR} />
            <circle cx={x(i)} cy={yAmount(d.amount)} r={hover === i ? 4 : 2} fill={AMOUNT_COLOR} />
            {(data.length - 1 - i) % labelEvery === 0 ? (
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#6B7280">
                {fmtDay(d.date, data.length <= 10)}
              </text>
            ) : null}
            {/* hover hit area */}
            <rect
              x={x(i) - (step || innerW) / 2}
              y={PAD.top}
              width={step || innerW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="#9CA3AF"
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        )}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > data.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="font-semibold text-gray-800">{fmtDay(hovered.date)}</p>
          <p className="text-gray-600">
            Số GD: <b className="text-blue-600">{fmtInt(hovered.count)}</b>
          </p>
          <p className="text-gray-600">
            Thành công: <b className="text-emerald-600">{fmtInt(hovered.successCount)}</b> · Thất
            bại: <b className="text-red-500">{fmtInt(hovered.failedCount)}</b>
          </p>
          <p className="text-gray-600">
            Tổng tiền: <b className="text-emerald-700">{fmtVnd(hovered.amount)}</b>
          </p>
        </div>
      )}
      {totalCount === 0 && (
        <p className="mt-1 text-center text-xs text-gray-400">Chưa có giao dịch trong khoảng này</p>
      )}
    </div>
  );
}
