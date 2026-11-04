"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Users,
  ClipboardList,
  UserCog,
  BarChart3,
  Truck,
  Globe,
  Megaphone,
  Calculator,
  Settings,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "POS Bán hàng", href: "/pos", icon: ShoppingCart },
  { label: "Sản phẩm", href: "/products", icon: Package },
  { label: "Kho hàng", href: "/warehouse", icon: Warehouse, badge: 3 },
  { label: "Khách hàng", href: "/crm", icon: Users },
  { label: "Đơn hàng", href: "/orders", icon: ClipboardList, badge: 8 },
  { label: "Nhân viên", href: "/staff", icon: UserCog },
  { label: "Báo cáo", href: "/reports", icon: BarChart3 },
  // section: Tiện ích
  { label: "Nhà cung cấp", href: "/suppliers", icon: Truck, section: "TIỆN ÍCH" },
  { label: "Omni Channel", href: "/omni", icon: Globe },
  { label: "Marketing", href: "/marketing", icon: Megaphone },
  { label: "Kế toán", href: "/accounting", icon: Calculator },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { label: "Cài đặt", href: "/settings", icon: Settings },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-56",
        className,
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        {collapsed ? (
          <span className="text-xl font-black text-primary">B</span>
        ) : (
          <span className="text-xl font-black tracking-tight text-primary">
            Biz<span className="text-gray-800">One</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <div key={item.href}>
              {item.section && !collapsed && (
                <p className="mt-4 mb-1 px-4 text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                  {item.section}
                </p>
              )}
              {item.section && collapsed && i > 0 && (
                <div className="mx-3 my-2 border-t border-gray-200" />
              )}
              <Link
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", active ? "text-blue-600" : "text-gray-400")}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.badge ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
                {collapsed && item.badge ? (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute top-1/2 -right-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-gray-700"
        aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
