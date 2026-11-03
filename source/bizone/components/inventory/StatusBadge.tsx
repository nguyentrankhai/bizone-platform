import { cn } from "@/lib/utils";
import { TX_STATUS } from "./shared";

export function StatusBadge({ status }: { status: string }) {
  const s = TX_STATUS[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>
      {s.label}
    </span>
  );
}
