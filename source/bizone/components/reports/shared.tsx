"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney, fmtNumber } from "@/components/inventory/shared";

/** Series colours (validated with the dataviz palette checker, light surface) */
export const SERIES = { current: "#2563EB", compare: "#E07B39" };

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${fmtNumber(v)}%`;
}

export function Change({
  value,
  suffix = "",
}: {
  value: number | null | undefined;
  suffix?: string;
}) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={flat ? "text-slate-500" : up ? "text-emerald-700" : "text-red-600"}>
      {flat ? "" : up ? "↑ " : "↓ "}
      {fmtNumber(Math.abs(value))}
      {suffix || "%"}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  change,
  changeSuffix,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  changeSuffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold break-words text-slate-800 tabular-nums xl:text-2xl">
        {value}
      </p>
      {change !== undefined && (
        <p className="mt-1 text-xs">
          <Change value={change} suffix={changeSuffix} />{" "}
          {hint && <span className="text-slate-500">{hint}</span>}
        </p>
      )}
    </div>
  );
}

export function dayOrMonthLabel(key: string): string {
  if (key.length === 7) return `T${Number(key.slice(5))}/${key.slice(2, 4)}`;
  const d = new Date(`${key}T00:00:00Z`);
  return `${["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getUTCDay()]} ${key.slice(8)}/${key.slice(5, 7)}`;
}

function shortMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmtNumber(Math.round(v / 1e8) / 10)} tỷ`;
  if (a >= 1e6) return `${fmtNumber(Math.round(v / 1e5) / 10)}tr`;
  if (a >= 1e3) return `${fmtNumber(Math.round(v / 100) / 10)}k`;
  return fmtNumber(v);
}

export interface BarPoint {
  key: string;
  value: number;
  compare: number | null;
  compareKey?: string | null;
}

/**
 * Grouped bars: current period (blue) vs comparison (orange), one value axis, hover tooltip per
 * group, legend above. Bars anchored at the baseline with rounded data ends.
 */
export function CompareBarChart({
  points,
  label,
  compareLabel,
  height = 220,
}: {
  points: BarPoint[];
  label: string;
  compareLabel: string | null;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hasCompare = compareLabel !== null && points.some((p) => p.compare !== null);
  const max = Math.max(1, ...points.flatMap((p) => [p.value, p.compare ?? 0]));
  const min = Math.min(0, ...points.flatMap((p) => [p.value, p.compare ?? 0]));
  const W = Math.max(boxW || 320, points.length * (hasCompare ? 22 : 16));
  const padL = 48;
  const padB = 22;
  const H = height;
  const plotH = H - padB - 8;
  const y = (v: number) => 8 + ((max - v) / (max - min)) * plotH;
  const step = (W - padL) / Math.max(1, points.length);
  const barW = Math.max(3, Math.min(18, (step - 4) / (hasCompare ? 2 : 1) - 2));
  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t);
  const labelEvery = Math.ceil(points.length / 10);

  const h = hover !== null ? points[hover] : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.current }} /> {label}
        </span>
        {hasCompare && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.compare }} />{" "}
            {compareLabel}
          </span>
        )}
        <span className="ml-auto min-h-4 text-slate-700 tabular-nums" aria-live="polite">
          {h &&
            `${dayOrMonthLabel(h.key)}: ${fmtMoney(h.value)}` +
              (hasCompare && h.compare !== null
                ? ` · ${h.compareKey ? dayOrMonthLabel(h.compareKey) : "kỳ so sánh"}: ${fmtMoney(h.compare)}`
                : "")}
        </span>
      </div>
      <div ref={box} className="overflow-x-auto">
        <svg width={W} height={H} role="img" aria-label={`Biểu đồ ${label}`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
                {shortMoney(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = padL + i * step + (step - (hasCompare ? barW * 2 + 2 : barW)) / 2;
            const bars = [
              { v: p.value, color: SERIES.current, x: hasCompare ? x0 + barW + 2 : x0 },
            ];
            if (hasCompare && p.compare !== null)
              bars.unshift({ v: p.compare, color: SERIES.compare, x: x0 });
            return (
              <g
                key={p.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                opacity={hover === null || hover === i ? 1 : 0.55}
              >
                <rect x={padL + i * step} y={0} width={step} height={H - padB} fill="transparent" />
                {bars.map((b, j) => {
                  const top = y(Math.max(0, b.v));
                  const hgt = Math.max(b.v === 0 ? 0 : 1, Math.abs(y(b.v) - y(0)));
                  return (
                    <rect
                      key={j}
                      x={b.x}
                      y={b.v >= 0 ? top : y(0)}
                      width={barW}
                      height={hgt}
                      rx={Math.min(4, barW / 2)}
                      fill={b.color}
                    />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text
                    x={padL + i * step + step / 2}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#64748b"
                  >
                    {dayOrMonthLabel(p.key)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Horizontal share bars (payment methods, categories) — single hue, value labels in ink */
export function ShareBars({ rows }: { rows: { label: string; value: number; percent: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-700">{r.label}</span>
            <span className="text-slate-600 tabular-nums">
              {fmtMoney(r.value)} ({fmtNumber(r.percent)}%)
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${(Math.max(0, r.value) / max) * 100}%`,
                background: SERIES.current,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="mr-auto font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export const thCls = "px-3 py-2 text-left font-medium whitespace-nowrap";
export const thNum = "px-3 py-2 text-right font-medium whitespace-nowrap";
export const tdNum = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

export const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
  wallet: "Ví điện tử",
  qr: "QR",
};
