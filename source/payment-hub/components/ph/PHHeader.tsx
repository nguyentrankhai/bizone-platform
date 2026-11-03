"use client";

import { usePathname } from "next/navigation";
import { Bell, Search, ChevronRight } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Giao dịch",
  "/merchants": "Đối tác",
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
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            <span className={i === crumbs.length - 1 ? "font-semibold text-gray-800" : "text-gray-400"}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Tìm giao dịch, đối tác..."
            className="h-8 w-60 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          TA
        </button>
      </div>
    </header>
  );
}
