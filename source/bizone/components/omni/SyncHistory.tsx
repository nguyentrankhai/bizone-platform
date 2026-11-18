"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { apiContext, fmtDate, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnSecondary, inputCls, useLoad } from "@/components/staff/shared";

export const CHANNEL_LABEL: Record<string, string> = {
  website: "Website",
  shopee: "Shopee",
  lazada: "Lazada",
};

const SYNC_TYPE: Record<string, string> = {
  order: "Đơn hàng",
  payment: "Thanh toán",
  stock: "Giá / tồn kho",
  product: "Sản phẩm",
  auth: "Kết nối",
};

type Channel = "website" | "shopee" | "lazada";

/** Sync log of one channel, or of every channel (P6.2 — shared by `/omni` screens) */
export function SyncHistory({ auth, channel }: { auth: ApiAuth; channel?: Channel }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | "failed">("");
  const logs = useLoad(`omni-logs-${channel ?? "all"}-${page}-${status}`, () =>
    trpc.omni.syncLogs.query(
      { page, limit: 20, ...(channel ? { channel } : {}), ...(status ? { status } : {}) },
      apiContext(auth),
    ),
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="font-semibold text-slate-900">Lịch sử đồng bộ</div>
        <div className="flex items-center gap-2">
          <select
            className={cn(inputCls, "w-auto")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "" | "failed");
              setPage(1);
            }}
            aria-label="Lọc kết quả"
          >
            <option value="">Tất cả</option>
            <option value="failed">Chỉ lỗi</option>
          </select>
          <button className={btnSecondary} onClick={logs.reload} aria-label="Tải lại">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ErrorBox message={logs.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2">Thời gian</th>
              {!channel && <th className="px-4 py-2">Kênh</th>}
              <th className="px-4 py-2">Loại</th>
              <th className="px-4 py-2">Kết quả</th>
              <th className="px-4 py-2">Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {(logs.data?.items ?? []).map((l) => (
              <tr key={l.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                  {fmtDate(l.createdAt, true)}
                </td>
                {!channel && (
                  <td className="px-4 py-2 whitespace-nowrap">
                    {CHANNEL_LABEL[l.channel ?? ""] ?? l.channel ?? "—"}
                  </td>
                )}
                <td className="px-4 py-2 whitespace-nowrap">
                  {SYNC_TYPE[l.syncType] ?? l.syncType} ·{" "}
                  {l.direction === "pull" ? "về BizOne" : "lên kênh"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                      l.status === "success"
                        ? "bg-green-50 text-green-700"
                        : l.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {l.status === "success"
                      ? "Thành công"
                      : l.status === "failed"
                        ? "Lỗi"
                        : "Một phần"}
                  </span>
                </td>
                <td className="px-4 py-2 break-words text-slate-700">{l.message}</td>
              </tr>
            ))}
            {logs.data && logs.data.items.length === 0 && (
              <tr>
                <td colSpan={channel ? 4 : 5} className="px-4 py-6 text-center text-slate-500">
                  Chưa có lượt đồng bộ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {logs.data && logs.data.total > logs.data.limit && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-sm">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span>
            {page} / {Math.ceil(logs.data.total / logs.data.limit)}
          </span>
          <button
            className={btnSecondary}
            disabled={page * logs.data.limit >= logs.data.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
