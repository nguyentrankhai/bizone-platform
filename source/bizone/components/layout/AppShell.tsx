"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { RequireAuth, useApiAuth } from "@/components/auth/AuthProvider";

interface AppShellProps {
  children: React.ReactNode;
  /** Optional strip under the top bar */
  banner?: React.ReactNode;
}

/**
 * Sidebar + top bar frame; safe to use from client components (no server-only code).
 * Only rendered for a signed-in user (P6.7) — otherwise the browser goes to Keycloak.
 * P6.4 (#54): under 768 px the sidebar is a drawer opened from the top bar's menu button.
 */
export function AppShell({ children, banner }: AppShellProps) {
  return (
    <RequireAuth>
      <ShellFrame banner={banner}>{children}</ShellFrame>
    </RequireAuth>
  );
}

function ShellFrame({ children, banner }: AppShellProps) {
  const auth = useApiAuth();
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
