import { decodeJwt, OidcClient, type SessionClaims } from "@/lib/auth-client";

/** Cookie mirroring the access token so admin pages can check the session on the server. */
export const SESSION_COOKIE = "ph_session";

/**
 * The Payment Hub Admin browser session (P6.7): client `payhub-admin-console`. Safe to import on
 * the server — nothing touches `window` until a method is called.
 */
export const oidc = new OidcClient({
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "payment-hub",
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "payhub-admin-console",
  storageKey: "payhub:auth",
  cookieName: SESSION_COOKIE,
});

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  roles: string[];
  merchantId?: string;
}

export function sessionUser(accessToken: string): SessionUser | null {
  const c = decodeJwt<SessionClaims>(accessToken);
  if (!c?.sub) return null;
  const username = c.preferred_username ?? c.sub;
  return {
    id: c.sub,
    username,
    name: c.name?.trim() || username,
    email: c.email,
    roles: (c.realm_access?.roles ?? []).filter((r) => r.startsWith("payhub-")),
    merchantId: c.merchant_id ? String(c.merchant_id) : undefined,
  };
}

/**
 * fetch for `/api/internal/*`: adds a fresh session token; a 401 → refresh once and retry.
 * Without a session the request goes out unauthenticated (the API answers 401).
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const res = await send(await oidc.getAccessToken());
  if (res.status !== 401 || !oidc.getSession()) return res;
  const fresh = await oidc.refresh();
  return fresh ? send(fresh.accessToken) : res;
}

/** Tell the API to stop accepting the current token (logout) — best effort. */
export async function revokeOnServer(token: string): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  });
}
