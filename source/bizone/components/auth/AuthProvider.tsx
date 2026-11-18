"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import type { StoredSession } from "@/lib/auth-client";
import type { ApiAuth } from "@/components/inventory/shared";
import {
  oidc,
  revokeOnServer,
  sessionApiAuth,
  sessionUser,
  type SessionUser,
} from "@/lib/session-client";

// Browser session hooks (P6.7). The session lives in localStorage (shared by tabs); these hooks
// read it through useSyncExternalStore, so the server render / first hydration pass sees
// `undefined` ("not known yet") and protected content is never rendered on the server.

const subscribe = (onChange: () => void) => oidc.subscribe(onChange);
const serverSnapshot = () => undefined;

/** undefined = not read yet (server / hydration), null = signed out */
export function useSession(): StoredSession | null | undefined {
  return useSyncExternalStore(subscribe, () => oidc.getSession(), serverSnapshot);
}

let userMemo: { token: string; user: SessionUser | null } = { token: "", user: null };
function currentUser(): SessionUser | null {
  const token = oidc.currentToken();
  if (token !== userMemo.token) userMemo = { token, user: token ? sessionUser(token) : null };
  return userMemo.user;
}
const tenantSnapshot = () => currentUser()?.tenantId ?? "";
const userKeySnapshot = () => {
  const u = currentUser();
  return u ? `${u.id}|${u.tenantId}|${u.name}|${u.roles.join(",")}` : "";
};

/** Signed-in user (re-renders only when identity changes, not on every token refresh). */
export function useCurrentUser(): SessionUser | null {
  const key = useSyncExternalStore(subscribe, userKeySnapshot, () => "");
  return useMemo(() => (key ? currentUser() : null), [key]);
}

/**
 * API credentials for client components under `<RequireAuth>`: a stable object (one per tenant)
 * whose `authToken` always reads the latest token — token refreshes don't re-render callers or
 * re-run their effects; the tRPC link fetches a fresh token per request anyway.
 */
export function useApiAuth(): ApiAuth {
  const tenantId = useSyncExternalStore(subscribe, tenantSnapshot, () => "");
  return useMemo(() => sessionApiAuth(tenantId), [tenantId]);
}

/** Keeps the token fresh for the whole app (root layout). */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => oidc.startAutoRefresh(), []);
  return children;
}

export function logout(): Promise<void> {
  return oidc.logout({ beforeClear: revokeOnServer, postLogoutPath: "/" });
}

/**
 * Renders children only for a signed-in user with a store (tenant_id claim); otherwise sends the
 * browser to Keycloak and comes back to the same URL afterwards.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const user = useCurrentUser();

  useEffect(() => {
    if (session !== null) return;
    const { pathname, search, hash } = window.location;
    void oidc.login(`${pathname}${search}${hash}`);
  }, [session]);

  if (session === undefined) return <Splash text="Đang tải..." />;
  if (session === null) return <Splash text="Đang chuyển tới trang đăng nhập..." />;
  if (!user?.tenantId) {
    return (
      <Splash text="Tài khoản chưa được gán cửa hàng (thiếu thuộc tính tenant_id trên Keycloak) — liên hệ quản trị viên.">
        <LogoutButton className="mt-4" />
      </Splash>
    );
  }
  return children;
}

function Splash({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="text-2xl font-black tracking-tight text-primary">
        Biz<span className="text-gray-800">One</span>
      </div>
      <p role="status" className="mt-3 max-w-md text-sm text-gray-500">
        {text}
      </p>
      {children}
    </div>
  );
}

export function LogoutButton({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void logout()}
      aria-label="Đăng xuất"
      title="Đăng xuất"
      className={`inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 ${className ?? ""}`}
    >
      <LogOut className="h-4 w-4" />
      {label && <span>Đăng xuất</span>}
    </button>
  );
}
