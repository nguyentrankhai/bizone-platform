"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { oidc, revokeOnServer, sessionUser, type SessionUser } from "@/lib/session-client";

// Payment Hub Admin browser session (P6.7). Admin pages are server components: they read the
// `ph_session` cookie (kept in step with the token by OidcClient) and render `<SessionGate>`
// instead of data when it is missing / expired. Client components call the API through
// `adminFetch()` (fresh token per request).

const subscribe = (onChange: () => void) => oidc.subscribe(onChange);

let userMemo: { token: string; user: SessionUser | null } = { token: "", user: null };
function currentUser(): SessionUser | null {
  const token = oidc.currentToken();
  if (token !== userMemo.token) userMemo = { token, user: token ? sessionUser(token) : null };
  return userMemo.user;
}
const userKeySnapshot = () => {
  const u = currentUser();
  return u ? `${u.id}|${u.name}|${u.roles.join(",")}|${u.merchantId ?? ""}` : "";
};

/** Signed-in user (re-renders only when identity changes, not on every token refresh). */
export function useCurrentUser(): SessionUser | null {
  const key = useSyncExternalStore(subscribe, userKeySnapshot, () => "");
  return useMemo(() => (key ? currentUser() : null), [key]);
}

function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/**
 * Root-layout provider: keeps the token (and the cookie) fresh, and when the session ends in
 * this or another tab (logout, refresh rejected) sends an admin page back to Keycloak.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stop = oidc.startAutoRefresh();
    let had = !!oidc.getSession();
    const unsubscribe = oidc.subscribe((s) => {
      if (had && !s && !window.location.pathname.startsWith("/auth/")) {
        void oidc.login(currentPath());
      }
      had = !!s;
    });
    return () => {
      stop();
      unsubscribe();
    };
  }, []);
  return children;
}

export function logout(): Promise<void> {
  return oidc.logout({ beforeClear: revokeOnServer, postLogoutPath: "/" });
}

/**
 * Rendered by a server page whose session check failed. `signin`: a stored session → refresh
 * the token (re-sets the cookie) and re-render the page once; none → Keycloak login.
 * `forbidden`: signed in without the needed role.
 */
export function SessionGate({
  reason,
  message,
}: {
  reason: "signin" | "forbidden";
  message?: string;
}) {
  const router = useRouter();
  const tried = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reason !== "signin" || tried.current) return;
    tried.current = true;
    const key = `payhub:auth:gate:${window.location.pathname}`;
    void (async () => {
      const session = oidc.getSession();
      if (!session) return oidc.login(currentPath());
      // one silent retry per page within 30 s — avoids a refresh loop if the server keeps saying no
      const last = Number(window.sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < 30_000) return setFailed(true);
      window.sessionStorage.setItem(key, String(Date.now()));
      // a refresh re-writes the cookie with the new token
      const fresh = await oidc.refresh();
      if (!fresh) return; // session ended → AuthProvider redirects to Keycloak
      router.refresh();
    })();
  }, [reason, router]);

  if (reason === "forbidden" || failed) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-gray-700">
          {reason === "forbidden"
            ? (message ?? "Bạn không có quyền xem trang này.")
            : "Không xác nhận được phiên đăng nhập — vui lòng đăng nhập lại."}
        </p>
        <LogoutButton className="mt-4" />
      </div>
    );
  }
  return (
    <p role="status" className="mt-16 text-center text-sm text-gray-500">
      Đang kiểm tra phiên đăng nhập...
    </p>
  );
}

export function LogoutButton({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void logout()}
      aria-label="Đăng xuất"
      title="Đăng xuất"
      className={`inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 ${className ?? ""}`}
    >
      <LogOut className="h-4 w-4" />
      {label && <span>Đăng xuất</span>}
    </button>
  );
}

/** Name + logout for the header */
export function UserMenu() {
  const user = useCurrentUser();
  return (
    <div className="flex items-center gap-2">
      {user && (
        <span
          className="max-w-48 truncate text-sm font-medium text-gray-700"
          title={user.email ?? user.username}
        >
          {user.name}
          {user.merchantId && (
            <span className="ml-1 text-xs text-gray-400">· merchant #{user.merchantId}</span>
          )}
        </span>
      )}
      <LogoutButton label={false} />
    </div>
  );
}
