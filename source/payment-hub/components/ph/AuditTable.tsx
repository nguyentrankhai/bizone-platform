"use client";

import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  fmtTime,
  type AuditKind,
  type SystemLogRow,
  type TransactionLogRow,
} from "./audit-api";

const RESULT_STYLE: Record<string, { label: string; cls: string }> = {
  success: { label: "Thành công", cls: "bg-emerald-50 text-emerald-700" },
  failure: { label: "Thất bại", cls: "bg-amber-50 text-amber-700" },
  denied: { label: "Bị từ chối", cls: "bg-red-50 text-red-700" },
};

interface AuditTableProps {
  kind: AuditKind;
  rows: (SystemLogRow | TransactionLogRow)[];
  onOpen: (id: string) => void;
}

/** Audit entries — a table on wide screens, stacked cards below 768 px. */
export function AuditTable({ kind, rows, onOpen }: AuditTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Không có bản ghi khớp bộ lọc.
      </div>
    );
  }
  if (kind === "system") {
    const items = rows as SystemLogRow[];
    return (
      <>
        <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Thời gian</th>
                <th className="px-4 py-2.5 font-semibold">Người thực hiện</th>
                <th className="px-4 py-2.5 font-semibold">Hành động</th>
                <th className="px-4 py-2.5 font-semibold">Đối tượng</th>
                <th className="px-4 py-2.5 font-semibold">Kết quả</th>
                <th className="px-4 py-2.5 font-semibold">IP</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                    {fmtTime(r.createdAt)}
                  </td>
                  <td
                    className="max-w-48 truncate px-4 py-2.5 text-gray-800"
                    title={r.username ?? ""}
                  >
                    {r.username ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-gray-800">{ACTION_LABELS[r.action] ?? r.action}</span>
                    <span className="block text-xs text-gray-400">{r.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {r.entityType}
                    {r.entityId && <span className="text-gray-400"> #{r.entityId}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        RESULT_STYLE[r.result]?.cls,
                      )}
                      title={r.description ?? ""}
                    >
                      {RESULT_STYLE[r.result]?.label ?? r.result}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{r.ipAddress ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="rounded-lg px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Xem dữ liệu
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-2 md:hidden">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-800">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                      RESULT_STYLE[r.result]?.cls,
                    )}
                  >
                    {RESULT_STYLE[r.result]?.label ?? r.result}
                  </span>
                </div>
                <p className="mt-1 text-xs break-words text-gray-500">
                  {fmtTime(r.createdAt)} · {r.username ?? "—"} · {r.entityType}
                  {r.entityId ? ` #${r.entityId}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }
  const items = rows as TransactionLogRow[];
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Thời gian</th>
              <th className="px-4 py-2.5 font-semibold">Giao dịch</th>
              <th className="px-4 py-2.5 font-semibold">Sự kiện</th>
              <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
              <th className="px-4 py-2.5 font-semibold">Thực hiện bởi</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                  {fmtTime(r.createdAt)}
                </td>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap text-gray-800">
                  {r.txnCode}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-gray-800">{r.event}</span>
                  {r.description && (
                    <span
                      className="block max-w-md truncate text-xs text-gray-400"
                      title={r.description}
                    >
                      {r.description}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                  {r.fromStatus || r.toStatus
                    ? `${r.fromStatus ?? "—"} → ${r.toStatus ?? "—"}`
                    : "—"}
                </td>
                <td className="max-w-48 truncate px-4 py-2.5 text-gray-500">
                  {r.createdBy ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="rounded-lg px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    Xem dữ liệu
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium break-all text-gray-800">{r.txnCode}</span>
                <span className="shrink-0 text-xs text-gray-500">{r.event}</span>
              </div>
              <p className="mt-1 text-xs break-words text-gray-500">
                {fmtTime(r.createdAt)} · {r.fromStatus ?? "—"} → {r.toStatus ?? "—"} ·{" "}
                {r.createdBy ?? "—"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
