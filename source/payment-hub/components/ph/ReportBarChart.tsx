"use client";

import { useState } from "react";
import { niceMax } from "./RevenueChart";

/**
 * Stacked bar chart for the reports (P5.5) — plain SVG like the dashboard charts. One bar per
 * period, segments stacked bottom-up; hover shows every series of the bar.
 */

export interface BarSeries {
  key: string;
  name: string;
  color: string;
}

export interface BarItem {
  key: string;
  label: string;
  values: Record<string, number>;
}

const PAD = { top: 16, right: 12, bottom: 32, left: 56 };

export function ReportBarChart({
  items,
  series,
  format,
  axisFormat,
  ariaLabel,
  emptyText = "Không có dữ liệu trong khoảng này",
  width = 720,
  height = 240,
}: {
  items: BarItem[];
  series: BarSeries[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  ariaLabel: string;
  emptyText?: string;
  /** viewBox size: a narrower box keeps the labels readable in a half-width card. */
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const totals = items.map((it) => series.reduce((a, s) => a + (it.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));
  const slot = items.length ? innerW / items.length : innerW;
  const barW = Math.max(2, Math.min(48, slot * 0.65));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = items.length > 16 ? Math.ceil(items.length / 12) : 1;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const fmtAxis = axisFormat ?? format;
  const empty = totals.every((t) => t === 0);
  const hovered = hover === null ? null : items[hover];

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        {grid.map((g) => {
          const gy = PAD.top + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#E5E7EB" />
              <text x={PAD.left - 8} y={gy + 4} textAnchor="end" fontSize="11" fill="#6B7280">
                {fmtAxis(g * max)}
              </text>
            </g>
          );
        })}
        {items.map((it, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={it.key}>
              {hover === i && (
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="#F3F4F6"
                />
              )}
              {series.map((s) => {
                const v = it.values[s.key] ?? 0;
                if (v <= 0) return null;
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                return (
                  <rect
                    key={s.key}
                    x={cx - barW / 2}
                    y={top}
                    width={barW}
                    height={Math.max(h, 0.5)}
                    fill={s.color}
                    rx={1.5}
                  />
                );
              })}
              {(items.length - 1 - i) % labelEvery === 0 && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="#6B7280">
                  {it.label}
                </text>
              )}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover > items.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="font-semibold text-gray-800">{hovered.label}</p>
          {series.map((s) => (
            <p key={s.key} className="text-gray-600">
              {s.name}: <b style={{ color: s.color }}>{format(hovered.values[s.key] ?? 0)}</b>
            </p>
          ))}
        </div>
      )}
      {empty && <p className="mt-1 text-center text-xs text-gray-400">{emptyText}</p>}
    </div>
  );
}
