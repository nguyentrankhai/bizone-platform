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
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  section?: string;
  /** Module not built yet — shown greyed out instead of linking to a 404 */
  soon?: string;
  /** Other path prefixes that belong to this module (highlight the item there too) */
  also?: string[];
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
  {
    label: "Nhà cung cấp",
    href: "/suppliers",
    icon: Truck,
    section: "TIỆN ÍCH",
    also: ["/purchase-orders"],
  },
  { label: "Omni Channel", href: "/omni", icon: Globe },
  { label: "Marketing", href: "/marketing", icon: Megaphone },
  { label: "Kế toán", href: "/accounting", icon: Calculator },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { label: "Cài đặt", href: "/settings/branches", icon: Settings, also: ["/settings"] },
];

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

interface SidebarProps {
  className?: string;
  /** Phones (< 768 px): drawer state, opened from the top bar's menu button (P6.4, #54) */
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ className, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  // Tablets start collapsed (icons only) so the page content stays usable; once the user
  // toggles, their choice wins. Phones get the full-width drawer instead.
  const phone = useMedia("(max-width: 767px)");
  const narrow = useMedia("(max-width: 1023px)");
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const collapsed = phone ? false : (userCollapsed ?? narrow);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  return (
    <>
      {/* phone drawer backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-label="Menu chính"
        className={cn(
          "flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-200",
          // phones: off-canvas drawer; tablet / desktop: static column
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl md:relative md:z-auto md:max-w-none md:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          !mobileOpen && "max-md:invisible",
          collapsed ? "md:w-16" : "md:w-56",
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const active = [item.href, ...(item.also ?? [])].some((p) => pathname?.startsWith(p));
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
                {item.soon ? (
                  <span
                    aria-disabled="true"
                    title={`${item.label} — đang xây dựng (${item.soon})`}
                    className="flex cursor-not-allowed items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-300"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-gray-300" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && (
                      <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">
                        Sắp có
                      </span>
                    )}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onClose}
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
                )}
              </div>
            );
          })}
        </nav>

        {/* Phones: the store-owner app (P6.4) */}
        <Link
          href="/mobile/dashboard"
          onClick={onClose}
          className="flex min-h-12 items-center gap-3 border-t border-gray-200 px-4 text-sm font-medium text-blue-600 md:hidden"
        >
          <Smartphone className="h-5 w-5 shrink-0" /> Giao diện điện thoại
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={() => setUserCollapsed(!collapsed)}
          className="absolute top-1/2 -right-3 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-gray-700 md:flex"
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>
    </>
  );
}
