"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { eventDef, SEVERITY_STYLE, type NotificationSeverity } from "@/lib/notifications/events";
import { cn } from "@/lib/utils";

export function timeAgo(iso: string | Date, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function SeverityDot({ severity, className }: { severity: string; className?: string }) {
  const style = SEVERITY_STYLE[severity as NotificationSeverity] ?? SEVERITY_STYLE.info;
  return (
    <span
      aria-label={style.label}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", style.dot, className)}
    />
  );
}

export const eventLabel = (type: string) =>
  eventDef(type)?.label ??
  (
    { test: "Gửi thử", campaign: "Chiến dịch", report_email: "Email báo cáo" } as Record<
      string,
      string
    >
  )[type] ??
  type;

const TABS = [
  { href: "/notifications", label: "Thông báo", admin: false },
  { href: "/notifications/preferences", label: "Tuỳ chọn của tôi", admin: false },
  { href: "/notifications/settings", label: "Cấu hình gửi", admin: true },
  { href: "/notifications/templates", label: "Mẫu thông báo", admin: true },
  { href: "/notifications/deliveries", label: "Lịch sử gửi", admin: true },
];

export function NotificationNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Thông báo">
      <div className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active =
            t.href === "/notifications" ? pathname === t.href : pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function NotificationHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Thông báo</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <NotificationNav />
    </div>
  );
}

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Đang gửi", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Đã gửi", className: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Lỗi", className: "bg-red-50 text-red-700" },
  skipped: { label: "Bỏ qua", className: "bg-amber-50 text-amber-700" },
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  push: "Web Push",
};
