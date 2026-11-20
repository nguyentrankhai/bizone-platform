"use client";

import { usePathname } from "next/navigation";
import { Bell, Search, ChevronRight, Menu } from "lucide-react";
import { setMobileNav } from "./mobile-nav";
import { UserMenu } from "@/components/auth/AuthProvider";

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Giao dịch",
  "/partners": "Đối tác",
  "/partners/new": "Thêm mới",
  "/merchants": "Merchant",
  "/connectors": "Connector",
  "/webhooks": "Webhook",
  "/reconciliation": "Đối soát",
  "/reports": "Báo cáo",
  "/audit-log": "Audit Log",
  "/settings": "Cài đặt",
};

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [{ label: "Payment Hub", href: "/dashboard" }];
  let path = "";
  for (const seg of segments) {
    path += `/${seg}`;
    crumbs.push({ label: ROUTE_LABELS[path] ?? seg, href: path });
  }
  return crumbs;
}

export function PHHeader() {
  const crumbs = useBreadcrumbs();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 md:px-6">
      <button
        type="button"
        aria-label="Mở menu"
        onClick={() => setMobileNav(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Breadcrumb (last crumb only on phones) */}
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm">
        {crumbs.map((crumb, i) => (
          <span
            key={crumb.href}
            className={
              i === crumbs.length - 1
                ? "flex min-w-0 items-center gap-1.5"
                : "hidden items-center gap-1.5 sm:flex"
            }
          >
            {i > 0 && <ChevronRight className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />}
            <span
              className={
                i === crumbs.length - 1 ? "truncate font-semibold text-gray-800" : "text-gray-400"
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <div className="relative hidden lg:block">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Tìm giao dịch, đối tác..."
            className="h-8 w-60 rounded-lg border border-gray-200 bg-gray-50 pr-3 pl-8 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none"
          />
        </div>

        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
