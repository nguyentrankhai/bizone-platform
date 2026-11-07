import "server-only";
import { AppShell } from "./AppShell";
import { connection } from "next/server";
import { Suspense } from "react";
import { devAuthProblem } from "@/lib/dev-auth";

interface AppLayoutProps {
  children: React.ReactNode;
}

/** Server layout for pages: AppShell + per-request sign-in notice. Client components use AppShell. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AppShell
      banner={
        <Suspense fallback={null}>
          <AuthNotice />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

/** Explains empty pages while browser login (Keycloak) is not wired yet — see PROGRESS #7 */
async function AuthNotice() {
  await connection(); // evaluate per request, not frozen at build time
  const problem = devAuthProblem();
  if (!problem) return null;
  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6"
    >
      <strong>Chưa đăng nhập:</strong>{" "}
      {problem === "missing"
        ? "chưa có token truy cập nên trang không tải được dữ liệu."
        : "token truy cập đã hết hạn (15 phút) nên dữ liệu không tải được."}{" "}
      Đăng nhập Keycloak trên trình duyệt chưa được xây dựng — tạm thời đặt{" "}
      <code className="rounded bg-amber-100 px-1">DEV_AUTH_TOKEN</code> (token Keycloak của user
      dev) trong <code className="rounded bg-amber-100 px-1">.env.local</code> rồi khởi động lại{" "}
      <code className="rounded bg-amber-100 px-1">npm run dev</code>.
    </div>
  );
}
