import { connection } from "next/server";
import { Suspense } from "react";
import { devBypassNotice } from "@/lib/dev-auth";
import { PHSidebar } from "./PHSidebar";
import { PHHeader } from "./PHHeader";

interface PHLayoutProps {
  children: React.ReactNode;
}

export function PHLayout({ children }: PHLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <PHSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PHHeader />
        <Suspense fallback={null}>
          <DevModeNotice />
        </Suspense>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}

/** "Chế độ dev" strip while AUTH_DEV_BYPASS=true (P4.0) — evaluated per request. */
async function DevModeNotice() {
  await connection();
  const notice = devBypassNotice();
  if (!notice) return null;
  return (
    <div
      role="status"
      className="border-b border-violet-200 bg-violet-50 px-6 py-1.5 text-xs text-violet-900"
    >
      <strong>Chế độ dev:</strong> bỏ qua đăng nhập Keycloak (
      <code className="rounded bg-violet-100 px-1">AUTH_DEV_BYPASS=true</code>) — đang thao tác với{" "}
      <strong>{notice.username}</strong>
      {notice.roles.length > 0 && <> ({notice.roles.join(", ")})</>}
      {notice.merchantId && <>, merchant #{notice.merchantId}</>}. Không bật trên production.
    </div>
  );
}
