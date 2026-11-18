import { decodeJwt, OidcClient, type SessionClaims } from "@/lib/auth-client";
import { clearSnapshots } from "@/lib/pwa/snapshot";
import type { ApiAuth } from "@/components/inventory/shared";

/**
 * The BizOne browser session (P6.7): one OIDC client for the whole app (client `bizone-frontend`).
 * Safe to import on the server — nothing touches `window` until a method is called.
 */
export const oidc = new OidcClient({
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "bizone",
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "bizone-frontend",
  storageKey: "bizone:auth",
  // #142: offline copies of the owner app must not outlive the session
  onLogout: async () => {
    clearSnapshots();
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  },
});

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  tenantId: string;
  roles: string[];
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
    tenantId: c.tenant_id ?? "",
    roles: (c.realm_access?.roles ?? []).filter((r) => r.startsWith("bizone-")),
  };
}

/**
 * API auth backed by the session: `authToken` always reads the latest stored token (refreshes
 * rotate it), and `session: true` makes the tRPC link fetch a fresh one before each request.
 */
export function sessionApiAuth(tenantId: string): ApiAuth {
  return {
    tenantId,
    session: true,
    get authToken() {
      return oidc.currentToken();
    },
  };
}

/** Tell the API to stop accepting the current token (logout) — best effort. */
export async function revokeOnServer(token: string): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  });
}
