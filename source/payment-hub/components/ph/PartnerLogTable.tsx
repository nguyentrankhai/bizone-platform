"use client";

import type { PartnerLogView } from "@/lib/partner-types";
import { fmtDateTime } from "./partner-api";

const FIELD_LABELS: Record<string, string> = {
  created: "Tạo cấu hình",
  name: "Tên hiển thị",
  merchant_code: "Merchant code / Số TK",
  environment: "Môi trường",
  api_key: "API key / BIN",
  secret_key: "Secret key / Tên chủ TK",
  endpoint_sandbox: "Endpoint Sandbox",
  endpoint_production: "Endpoint Production",
  callback_url: "Callback URL",
  webhook_url: "Webhook URL",
  timeout: "Timeout (ms)",
  retry_policy: "Retry policy",
  status: "Trạng thái",
  test_connection: "Test kết nối",
};

interface PartnerLogTableProps {
  items: PartnerLogView[];
  page: number;
  totalPages: number;
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
}

function Value({ v, tone }: { v: string | null; tone: "old" | "new" }) {
  if (v === null || v === "") return <span className="text-gray-300">—</span>;
  return (
    <span
      className={
        tone === "old" ? "text-red-600 line-through decoration-red-300" : "text-emerald-700"
      }
    >
      {v}
    </span>
  );
}

export function PartnerLogTable({
  items,
  page,
  totalPages,
  total,
  loading,
  onPage,
}: PartnerLogTableProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <th className="py-2 pr-3">Thời gian</th>
              <th className="py-2 pr-3">Người thực hiện</th>
              <th className="py-2 pr-3">Trường</th>
              <th className="py-2">Thay đổi</th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : undefined}>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400">
                  Chưa có thay đổi nào
                </td>
              </tr>
            ) : (
              items.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                    {fmtDateTime(log.createdAt)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-gray-800">{log.changedBy ?? "—"}</div>
                    {log.ipAddress && (
                      <div className="font-mono text-xs text-gray-400">{log.ipAddress}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                    {FIELD_LABELS[log.field] ?? log.field}
                  </td>
                  <td className="py-2 break-all">
                    {log.field === "test_connection" || log.field === "created" ? (
                      <Value v={log.newValue} tone="new" />
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Value v={log.oldValue} tone="old" />
                        <span className="text-gray-400">→</span>
                        <Value v={log.newValue} tone="new" />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>
            {total} thay đổi · trang {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => onPage(page - 1)}
              className="h-8 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => onPage(page + 1)}
              className="h-8 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
