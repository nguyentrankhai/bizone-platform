import "server-only";
import { AppShell } from "./AppShell";
import { connection } from "next/server";
import { Suspense } from "react";
import { devAuthProblem, devBypassNotice, getDevAuth } from "@/lib/dev-auth";

interface AppLayoutProps {
  children: React.ReactNode;
}

/** Server layout for pages: AppShell + per-request sign-in notice. Client components use AppShell. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AppShell
      auth={getDevAuth()}
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
  const bypass = devBypassNotice();
  const problem = devAuthProblem();
  return (
    <>
      {bypass && (
        <div
          role="status"
          className="border-b border-violet-200 bg-violet-50 px-4 py-1.5 text-xs text-violet-900 sm:px-6"
        >
          <strong>Chế độ dev:</strong> bỏ qua đăng nhập Keycloak (
          <code className="rounded bg-violet-100 px-1">AUTH_DEV_BYPASS=true</code>) — đang thao tác
          với <strong>{bypass.username}</strong>
          {bypass.roles.length > 0 && <> ({bypass.roles.join(", ")})</>}. Không bật trên production.
        </div>
      )}
      {problem && <ProblemNotice problem={problem} bypass={!!bypass} />}
    </>
  );
}

function ProblemNotice({ problem, bypass }: { problem: "missing" | "expired"; bypass: boolean }) {
  if (bypass) {
    return (
      <div
        role="alert"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6"
      >
        <strong>Token hết hạn:</strong>{" "}
        <code className="rounded bg-amber-100 px-1">DEV_AUTH_TOKEN</code> đã quá 15 phút — xoá biến
        này trong <code className="rounded bg-amber-100 px-1">.env.local</code> để dùng user dev của
        chế độ bypass, hoặc thay token mới.
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6"
    >
      <strong>Chưa đăng nhập:</strong>{" "}
      {problem === "missing"
        ? "chưa có token truy cập nên trang không tải được dữ liệu."
        : "token truy cập đã hết hạn (15 phút) nên dữ liệu không tải được."}{" "}
      Đăng nhập Keycloak trên trình duyệt chưa được xây dựng — khi dev đặt{" "}
      <code className="rounded bg-amber-100 px-1">AUTH_DEV_BYPASS=true</code> (hoặc{" "}
      <code className="rounded bg-amber-100 px-1">DEV_AUTH_TOKEN</code> là token Keycloak) trong{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code> rồi khởi động lại{" "}
      <code className="rounded bg-amber-100 px-1">npm run dev</code>.
    </div>
  );
}
