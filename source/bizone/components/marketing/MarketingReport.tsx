"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, fmtNumber, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, inputAutoCls, useLoad } from "@/components/staff/shared";
import { MarketingHeader, StatusPill } from "./shared";

const TYPE = {
  coupon: { label: "Mã giảm giá", tone: "blue", unit: "lượt" },
  flash_sale: { label: "Flash sale", tone: "red", unit: "SP" },
  buy_x_get_y: { label: "Mua X tặng Y", tone: "amber", unit: "quà" },
  combo: { label: "Combo", tone: "green", unit: "bộ" },
} as const;

/** YYYY-MM-DD minus `days` */
const minusDays = (key: string, days: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** `today` (VN date) comes from the server request — no clock reads while prerendering */
export function MarketingReport({ auth, today }: { auth: ApiAuth; today: string }) {
  const [from, setFrom] = useState(minusDays(today, 29));
  const [to, setTo] = useState(today);
  const valid = from <= to;
  const data = useLoad(`mkt-report:${from}:${to}`, () =>
    valid ? trpc.promotion.report.query({ from, to }, apiContext(auth)) : Promise.resolve(null),
  );
  const rows = data.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <MarketingHeader
        title="Hiệu quả khuyến mãi"
        subtitle="Số hoá đơn, số tiền giảm và doanh thu đi kèm từng chương trình (hoá đơn đã huỷ không tính)"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="date"
          className={inputAutoCls}
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Từ ngày"
        />
        <span className="text-slate-500">→</span>
        <input
          type="date"
          className={inputAutoCls}
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Đến ngày"
        />
      </div>
      <ErrorBox message={!valid ? "Ngày bắt đầu phải trước ngày kết thúc" : data.error} />
      {data.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Tổng tiền giảm" value={fmtMoney(data.data.totals.discount)} />
          <Stat label="Lượt áp dụng (hoá đơn)" value={fmtNumber(data.data.totals.invoices)} />
          <Stat label="Chương trình có phát sinh" value={fmtNumber(rows.length)} />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Chương trình</th>
                <th className="px-4 py-3 text-right">Hoá đơn</th>
                <th className="px-4 py-3 text-right">Số lượng</th>
                <th className="px-4 py-3 text-right">Tiền giảm</th>
                <th className="px-4 py-3 text-right">Doanh thu đi kèm</th>
                <th className="px-4 py-3 text-right">TB / hoá đơn</th>
                <th className="px-4 py-3 text-right">Tỷ lệ giảm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {data.loading
                      ? "Đang tải…"
                      : "Chưa có khuyến mãi nào được áp dụng trong khoảng này"}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={`${r.type}:${r.id}`}>
                  <td className="px-4 py-3">
                    <StatusPill tone={TYPE[r.type].tone}>{TYPE[r.type].label}</StatusPill>
                    <span className="ml-2 font-medium text-slate-800">{r.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(r.invoices)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtNumber(r.quantity)} {TYPE[r.type].unit}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-rose-600 tabular-nums">
                    −{fmtMoney(r.discount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.avgOrder)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtNumber(r.discountRate)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Tỷ lệ giảm = tiền giảm / (doanh thu + tiền giảm). Một hoá đơn có nhiều khuyến mãi được tính
        ở mỗi chương trình.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}
