"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, ClipboardList, LayoutDashboard } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/components/ui/Toast";
import type { ApiAuth } from "@/components/inventory/shared";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/mobile/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/mobile/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/mobile/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/mobile/notifications", label: "Thông báo", icon: Bell },
] as const;

/** Bottom navigation of the mobile app (P6.4) — thumb-reachable, 44 px+ targets, notch-safe */
export function BottomNav({ auth }: { auth: ApiAuth }) {
  const pathname = usePathname();
  const toast = useToast();
  // live unread badge (WebSocket, poll fallback) + a toast for each new notification
  const { unread } = useNotifications(auth, (n) => {
    const kind = n.severity === "error" ? "error" : n.severity === "warning" ? "warning" : "info";
    toast.toast(kind, n.title);
  });

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.href || pathname?.startsWith(`${t.href}/`);
          const badge = t.href === "/mobile/notifications" && unread ? unread : 0;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-slate-500",
                )}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} />
                  {badge > 0 && (
                    <span
                      aria-label={`${badge} chưa đọc`}
                      className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-bold text-white"
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
