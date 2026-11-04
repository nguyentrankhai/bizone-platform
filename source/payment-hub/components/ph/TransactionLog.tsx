"use client";

export interface TxnLogEntry {
  id: string;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  rawData?: unknown;
}

interface TransactionLogProps {
  logs: TxnLogEntry[];
}

const EVENT_LABELS: Record<string, string> = {
  created: "Tạo giao dịch",
  "status_changed:pending": "Chuyển sang Đang xử lý",
  "status_changed:success": "Thanh toán thành công",
  "status_changed:failed": "Thanh toán thất bại",
  "status_changed:expired": "Hết hạn",
  "status_changed:refunded": "Đã hoàn tiền",
  expired: "Hết hạn (tự động)",
  refund_initiated: "Khởi tạo hoàn tiền",
  webhook_sent: "Gửi webhook",
};

const EVENT_COLORS: Record<string, string> = {
  created: "bg-blue-100 text-blue-700",
  "status_changed:success": "bg-emerald-100 text-emerald-700",
  "status_changed:failed": "bg-red-100 text-red-700",
  "status_changed:expired": "bg-gray-100 text-gray-500",
  expired: "bg-gray-100 text-gray-500",
  "status_changed:refunded": "bg-purple-100 text-purple-700",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TransactionLog({ logs }: TransactionLogProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-400">Chưa có log nào.</p>;
  }

  return (
    <ol className="relative space-y-5 border-l border-gray-200 pl-5">
      {logs.map((log) => {
        const colorCls = EVENT_COLORS[log.event] ?? "bg-amber-100 text-amber-700";
        const label = EVENT_LABELS[log.event] ?? log.event;

        return (
          <li key={log.id} className="relative">
            <span className="absolute top-1 -left-[21px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-gray-300 ring-1 ring-gray-200" />

            <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorCls}`}>
                  {label}
                </span>
                {log.fromStatus && log.toStatus && (
                  <span className="text-xs text-gray-400">
                    {log.fromStatus} → {log.toStatus}
                  </span>
                )}
              </div>
              {log.description && <p className="mt-1 text-xs text-gray-600">{log.description}</p>}
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                <span>{formatDateTime(log.createdAt)}</span>
                {log.createdBy && <span>bởi {log.createdBy}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
