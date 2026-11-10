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

/** Sidebar + top bar frame; safe to use from client components (no server-only code) */
export function AppShell({ children, banner, auth }: AppShellProps) {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar auth={auth} />
          {banner}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
