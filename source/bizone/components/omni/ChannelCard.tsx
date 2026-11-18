"use client";

import Link from "next/link";
import { ChevronRight, Globe, ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/components/inventory/shared";

export type ChannelCardState =
  "connected" | "paused" | "disconnected" | "reconnect" | "not_configured" | "soon";

const STATE: Record<ChannelCardState, { label: string; cls: string }> = {
  connected: { label: "Đang kết nối", cls: "bg-green-50 text-green-700" },
  paused: { label: "Tạm ngừng", cls: "bg-slate-100 text-slate-600" },
  disconnected: { label: "Chưa kết nối", cls: "bg-slate-100 text-slate-600" },
  reconnect: { label: "Cần kết nối lại", cls: "bg-red-50 text-red-700" },
  not_configured: { label: "Chưa cấu hình ứng dụng", cls: "bg-amber-50 text-amber-700" },
  soon: { label: "Sắp có (P6.3)", cls: "bg-slate-100 text-slate-500" },
};

const ICON = { website: Globe, shopee: ShoppingBag, lazada: Store } as const;
const TINT: Record<string, string> = {
  website: "bg-primary/10 text-primary",
  shopee: "bg-orange-50 text-orange-600",
  lazada: "bg-indigo-50 text-indigo-600",
};

/** One sales channel on the Omni Channel overview (P6.2) */
export function ChannelCard({
  code,
  name,
  detail,
  state,
  lastSyncAt,
  href,
}: {
  code: string;
  name: string;
  detail: string;
  state: ChannelCardState;
  lastSyncAt: string | null;
  href: string | null;
}) {
  const Icon = ICON[code as keyof typeof ICON] ?? Store;
  const body = (
    <div
      className={cn(
        "flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4",
        href ? "transition hover:border-primary/40 hover:shadow-sm" : "opacity-70",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          TINT[code] ?? "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-slate-900">{name}</div>
          {href && <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="truncate text-xs text-slate-500">{detail}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE[state].cls)}>
            {STATE[state].label}
          </span>
          {lastSyncAt && (
            <span className="text-xs text-slate-400">Đồng bộ {fmtDate(lastSyncAt, true)}</span>
          )}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
