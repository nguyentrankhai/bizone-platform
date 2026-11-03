"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Puzzle,
  Webhook,
  BarChart3,
  FileText,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", section: "TỔNG QUAN" },
  { href: "/transactions", icon: CreditCard, label: "Giao dịch", section: "QUẢN LÝ" },
  { href: "/merchants", icon: Users, label: "Đối tác" },
  { href: "/connectors", icon: Puzzle, label: "Connector" },
  { href: "/webhooks", icon: Webhook, label: "Webhook" },
  { href: "/reconciliation", icon: BarChart3, label: "Đối soát" },
  { href: "/reports", icon: FileText, label: "Báo cáo", section: "BÁO CÁO" },
  { href: "/audit-log", icon: Shield, label: "Audit Log" },
  { href: "/settings", icon: Settings, label: "Cài đặt", section: "HỆ THỐNG" },
];

export function PHSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-shrink-0 flex-col bg-slate-900 text-slate-100 transition-all duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-slate-700/60 px-4",
          collapsed ? "justify-center" : "gap-2.5",
        )}
      >
        <Zap className="h-6 w-6 flex-shrink-0 text-blue-400" />
        {!collapsed && (
          <span className="truncate text-sm font-bold tracking-wide text-white">
            Payment Hub
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map((item, idx) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          const prevItem = NAV_ITEMS[idx - 1];
          const showSection = item.section && item.section !== prevItem?.section;

          return (
            <div key={item.href}>
              {showSection && !collapsed && (
                <p className="mt-4 px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {item.section}
                </p>
              )}
              {showSection && collapsed && idx > 0 && (
                <div className="mx-3 my-2 border-t border-slate-700/60" />
              )}
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-blue-600/20 text-blue-400 font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-400 hover:text-white"
        aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
