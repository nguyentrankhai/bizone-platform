"use client";

import { CheckCircle2, CreditCard, Wallet, XCircle } from "lucide-react";
import type { DashboardData, DashboardPeriod } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { fmtInt, fmtVnd, fmtVndShort } from "./dashboard-format";

const COMPARE_LABEL: Record<DashboardPeriod, string> = {
  today: "so với hôm qua",
  "7days": "so với 7 ngày trước",
  "30days": "so với 30 ngày trước",
};

const TITLE_SUFFIX: Record<DashboardPeriod, string> = {
  today: "hôm nay",
  "7days": "7 ngày",
  "30days": "30 ngày",
};

function Change({
  value,
  label,
  goodWhenUp = true,
}: {
  value: number | null;
  label: string;
  goodWhenUp?: boolean;
}) {
  if (value === null) return <span className="text-gray-400">Chưa có dữ liệu kỳ trước</span>;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : up === goodWhenUp;
  return (
    <span
      className={cn(
        "font-medium",
        good === null ? "text-gray-500" : good ? "text-emerald-600" : "text-red-500",
      )}
    >
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(value).toLocaleString("vi-VN")}% {label}
    </span>
  );
}

function Card({
  icon: Icon,
  iconClass,
  label,
  value,
  title,
  sub,
  testId,
}: {
  icon: typeof CreditCard;
  iconClass: string;
  label: string;
  value: string;
  title?: string;
  sub: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold text-gray-900 tabular-nums" title={title}>
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-xs">{sub}</p>
    </div>
  );
}

export function DashboardStats({
  data,
  flash,
}: {
  data: Pick<DashboardData, "period" | "summary" | "changes">;
  /** Briefly highlights the cards after a realtime update. */
  flash?: boolean;
}) {
  const { period, summary, changes } = data;
  const cmp = COMPARE_LABEL[period];
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-4",
        flash && "animate-pulse",
      )}
    >
      <Card
        testId="stat-total"
        icon={CreditCard}
        iconClass="bg-blue-100 text-blue-600"
        label={`Tổng GD ${TITLE_SUFFIX[period]}`}
        value={fmtInt(summary.total)}
        sub={<Change value={changes.total} label={cmp} />}
      />
      <Card
        testId="stat-amount"
        icon={Wallet}
        iconClass="bg-emerald-100 text-emerald-600"
        label="Tổng tiền (GD thành công)"
        value={fmtVndShort(summary.paidAmount)}
        title={fmtVnd(summary.paidAmount)}
        sub={<Change value={changes.paidAmount} label={cmp} />}
      />
      <Card
        testId="stat-success"
        icon={CheckCircle2}
        iconClass="bg-blue-100 text-blue-600"
        label="GD thành công"
        value={fmtInt(summary.paid)}
        sub={
          <span className="font-medium text-emerald-600">
            Tỷ lệ{" "}
            {summary.successRate === null ? "—" : `${summary.successRate.toLocaleString("vi-VN")}%`}
            {summary.pending > 0 && (
              <span className="font-normal text-gray-400">
                {" "}
                · {fmtInt(summary.pending)} đang chờ
              </span>
            )}
          </span>
        }
      />
      <Card
        testId="stat-failed"
        icon={XCircle}
        iconClass="bg-red-100 text-red-600"
        label="GD thất bại"
        value={fmtInt(summary.failed)}
        sub={
          <>
            <Change value={changes.failed} label={cmp} goodWhenUp={false} />
            {summary.expired > 0 && (
              <span className="text-gray-400"> · {fmtInt(summary.expired)} hết hạn</span>
            )}
          </>
        }
      />
    </div>
  );
}
