"use client";

import { cn } from "@/lib/utils";
import type { RunView } from "./recon-api";

/** Reconciliation runs (P5.4): one row per partner config × day, newest first. */

export const vnd = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("vi-VN")} ₫`;

export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  Running: { label: "Đang chạy", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  Completed: { label: "Hoàn tất", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Failed: { label: "Lỗi", cls: "bg-red-100 text-red-700 border-red-200" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.Failed;
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

interface Props {
  runs: RunView[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function ReconciliationTable({ runs, selectedId, onSelect }: Props) {
  if (runs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Chưa có đợt đối soát nào. Đối soát tự động chạy lúc 00:00 cho ngày hôm trước, hoặc bấm
        &quot;Chạy đối soát&quot;.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2.5 font-medium">Ngày</th>
            <th className="px-3 py-2.5 font-medium">Đối tác</th>
            <th className="px-3 py-2.5 font-medium">Nguồn</th>
            <th className="px-3 py-2.5 text-right font-medium">GD PH / ĐT</th>
            <th className="px-3 py-2.5 text-right font-medium">Khớp</th>
            <th className="px-3 py-2.5 text-right font-medium">Lệch</th>
            <th className="px-3 py-2.5 text-right font-medium">Chênh lệch</th>
            <th className="px-3 py-2.5 font-medium">Trạng thái</th>
            <th className="px-3 py-2.5 font-medium">Hoàn tất</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const lech = r.unmatched_paymenthub + r.unmatched_partner + r.amount_mismatch_count;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={cn(
                  "cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50/50",
                  selectedId === r.id && "bg-blue-50",
                )}
              >
                <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-800">
                  <button
                    type="button"
                    className="min-h-8 text-left hover:text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.id);
                    }}
                  >
                    {fmtDay(r.run_date)}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {r.partner_name}
                  <div className="text-xs text-gray-400">{r.partner}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-600">
                  {r.source === "File" ? "File sao kê" : "Tra cứu API"}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {r.total_paymenthub} / {r.total_partner}
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-700">{r.matched_count}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={lech ? "font-semibold text-red-600" : "text-gray-500"}>
                    {lech}
                  </span>
                  {r.open_discrepancies > 0 && (
                    <div className="text-xs text-amber-600">{r.open_discrepancies} chưa xử lý</div>
                  )}
                  {r.unverified_count > 0 && (
                    <div className="text-xs text-gray-500">{r.unverified_count} chưa tra cứu</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {vnd(r.total_discrepancy)}
                </td>
                <td className="px-3 py-2.5">
                  <RunStatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-gray-500">
                  {fmtTime(r.completed_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
