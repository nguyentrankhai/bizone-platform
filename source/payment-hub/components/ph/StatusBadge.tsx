"use client";

import { cn } from "@/lib/utils";

export type TxnStatus =
  "Success" | "Failed" | "Pending" | "Expired" | "Created" | "Refunded" | "PartiallyRefunded";

const STATUS_CONFIG: Record<TxnStatus, { label: string; className: string }> = {
  Success: { label: "Thành công", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Failed: { label: "Thất bại", className: "bg-red-100 text-red-700 border-red-200" },
  Pending: { label: "Đang xử lý", className: "bg-amber-100 text-amber-700 border-amber-200" },
  Expired: { label: "Hết hạn", className: "bg-gray-100 text-gray-500 border-gray-200" },
  Created: { label: "Mới tạo", className: "bg-blue-100 text-blue-700 border-blue-200" },
  Refunded: { label: "Hoàn tiền", className: "bg-purple-100 text-purple-700 border-purple-200" },
  PartiallyRefunded: {
    label: "Hoàn một phần",
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
};

interface StatusBadgeProps {
  status: TxnStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Expired;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
