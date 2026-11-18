"use client";

import { Menu, Search } from "lucide-react";
import { BranchSwitcher } from "@/components/branch/BranchSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { ApiAuth } from "@/components/inventory/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LogoutButton, useCurrentUser } from "@/components/auth/AuthProvider";

interface TopBarProps {
  className?: string;
  /** Needed by the branch switcher; pages pass it through AppLayout */
  auth?: ApiAuth;
  /** Opens the sidebar drawer on phones (P6.4) */
  onMenu?: () => void;
}

export function TopBar({ className, auth, onMenu }: TopBarProps) {
  const [search, setSearch] = useState("");
  const user = useCurrentUser();

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-2 border-b border-gray-200 bg-white px-2 sm:gap-4 sm:px-4",
        className,
      )}
    >
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="Mở menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <span className="text-lg font-black tracking-tight text-primary sm:hidden">
        Biz<span className="text-gray-800">One</span>
      </span>
      {/* Search */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm sản phẩm, đơn hàng, khách hàng..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pr-4 pl-9 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
        {/* Branch selector (P4.6) */}
        {auth && <BranchSwitcher auth={auth} />}

        {/* Notifications (P4.7) */}
        {auth && <NotificationBell auth={auth} />}

        {/* Signed-in user (P6.7) */}
        {user && (
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white sm:flex"
            >
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span
              className="hidden max-w-40 truncate text-sm font-medium text-gray-700 lg:block"
              title={user.email ?? user.username}
            >
              {user.name}
            </span>
          </div>
        )}
        <LogoutButton label={false} className="shrink-0" />
      </div>
    </header>
  );
}
