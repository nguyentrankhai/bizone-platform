import { cn } from "@/lib/utils";
import { PARTNER_STATUS_LABEL, type PartnerEnv, type PartnerStatus } from "@/lib/partner-types";

const STATUS_STYLE: Record<PartnerStatus, { badge: string; dot: string }> = {
  Active: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  Inactive: { badge: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
  Error: { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        style.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {PARTNER_STATUS_LABEL[status]}
    </span>
  );
}

export function EnvBadge({ env }: { env: PartnerEnv }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
        env === "Production" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {env}
    </span>
  );
}
