"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import type { ApiAuth } from "@/components/inventory/shared";

interface AppShellProps {
  children: React.ReactNode;
  /** Optional strip under the top bar (e.g. the sign-in notice rendered by AppLayout) */
  banner?: React.ReactNode;
  /** API auth for shell widgets (branch switcher) */
  auth?: ApiAuth;
}

/**
 * Sidebar + top bar frame; safe to use from client components (no server-only code).
 * P6.4 (#54): under 768 px the sidebar is a drawer opened from the top bar's menu button.
 */
export function AppShell({ children, banner, auth }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden bg-gray-50">
        <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar auth={auth} onMenu={() => setNavOpen(true)} />
          {banner}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
