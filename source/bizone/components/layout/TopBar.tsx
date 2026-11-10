"use client";

import { Bell, Search } from "lucide-react";
import { BranchSwitcher } from "@/components/branch/BranchSwitcher";
import type { ApiAuth } from "@/components/inventory/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TopBarProps {
  className?: string;
  /** Needed by the branch switcher; pages pass it through AppLayout */
  auth?: ApiAuth;
}

export function TopBar({ className, auth }: TopBarProps) {
  const [search, setSearch] = useState("");

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4",
        className,
      )}
    >
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm sản phẩm, đơn hàng, khách hàng..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pr-4 pl-9 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Branch selector (P4.6) */}
        {auth && <BranchSwitcher auth={auth} />}

        {/* Notifications */}
        <button className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* Avatar */}
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          M
        </button>
      </div>
    </header>
  );
}
