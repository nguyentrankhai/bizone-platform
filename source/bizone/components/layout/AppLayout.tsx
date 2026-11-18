import { AppShell } from "./AppShell";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout for server pages: the AppShell frame. Sign-in is checked in the browser (`RequireAuth`
 * inside AppShell, P6.7) — pages render no data on the server.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
