"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { DashboardAlert } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { fmtRelative } from "./dashboard-format";

/** Alerts: abnormal failures, webhook failures, stuck outbox (SRS-PH-DASH-01-07). */

const STYLE = {
  error: { box: "border-red-500 bg-red-50", icon: XCircle, iconClass: "text-red-500" },
  warning: {
    box: "border-amber-500 bg-amber-50",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  info: { box: "border-blue-500 bg-blue-50", icon: Info, iconClass: "text-blue-500" },
} as const;

export function DashboardAlerts({ alerts, now }: { alerts: DashboardAlert[]; now: number }) {
  if (!alerts.length) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm"
        data-testid="alerts-empty"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
        <div>
          <p className="font-semibold text-gray-800">Hệ thống ổn định</p>
          <p className="text-xs text-gray-500">
            Không có giao dịch lỗi bất thường hay webhook thất bại.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ul className="space-y-3" data-testid="alerts">
      {alerts.map((a) => {
        const s = STYLE[a.level];
        const Icon = s.icon;
        const body = (
          <>
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.iconClass)} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{a.title}</p>
              <p className="text-xs break-words text-gray-600">{a.message}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{fmtRelative(a.at, now)}</p>
            </div>
          </>
        );
        return (
          <li key={a.id} data-alert={a.id}>
            {a.href ? (
              <Link
                href={a.href}
                className={cn("flex gap-3 rounded-lg border-l-4 p-3 hover:opacity-90", s.box)}
              >
                {body}
              </Link>
            ) : (
              <div className={cn("flex gap-3 rounded-lg border-l-4 p-3", s.box)}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
