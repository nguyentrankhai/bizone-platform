import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthUser, KeycloakToken } from "@/types/auth";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "bizone";
const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;
const ISSUER = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;

/**
 * Clients whose tokens this app accepts (`azp` claim). Any other client of the realm — even
 * with a valid signature — is rejected. Override with KEYCLOAK_ALLOWED_CLIENTS (comma list).
 */
const ALLOWED_CLIENTS = new Set(
  (process.env.KEYCLOAK_ALLOWED_CLIENTS ?? "bizone-frontend,bizone-api")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),
);

// Cache JWKS set — createRemoteJWKSet handles 24h caching + kid-miss refresh internally
const getJWKS = (() => {
  let cached: ReturnType<typeof createRemoteJWKSet> | null = null;
  return () => {
    cached ??= createRemoteJWKSet(new URL(JWKS_URL));
    return cached;
  };
})();

export type JwtVerifyResult = { ok: true; user: AuthUser } | { ok: false; reason: string };

export async function verifyJwt(token: string): Promise<JwtVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: ISSUER,
      // audience check: skip here — bizone-frontend is public client, no audience claim
    });

    const claims = payload as unknown as KeycloakToken;

    if (!claims.azp || !ALLOWED_CLIENTS.has(claims.azp)) {
      return { ok: false, reason: "client_not_allowed" };
    }

    if (!claims.tenant_id) {
      return { ok: false, reason: "missing_tenant_id_claim" };
    }

    const realmRoles = claims.realm_access?.roles ?? [];
    const resourceRoles = Object.fromEntries(
      Object.entries(claims.resource_access ?? {}).map(([k, v]) => [k, v.roles]),
    );
    const allRoles = [...realmRoles, ...Object.values(resourceRoles).flat()];

    const user: AuthUser = {
      id: claims.sub,
      username: claims.preferred_username,
      email: claims.email,
      name: claims.name,
      tenantId: claims.tenant_id,
      roles: [...new Set(allRoles)],
      resourceRoles,
      expiresAt: claims.exp,
    };

    return { ok: true, user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, reason: msg };
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// ─── Dev auth bypass (P4.0) ──────────────────────────────────────────────────
// Browser login (Keycloak OIDC) is not built yet (PROGRESS #7, P6.7). With AUTH_DEV_BYPASS=true a
// request WITHOUT a token (or with the placeholder token below) runs as a configured dev user;
// a real token is still fully verified, so permission tests with real users keep working.
// Remove together with P6.7.

/** Placeholder token pages hand to clients when bypass is on (WS subprotocols can't be empty). */
export const DEV_BYPASS_TOKEN = "dev-bypass";

const DEV_TOKEN_TTL_SECONDS = 12 * 60 * 60;
let bypassWarned = false;

export function isDevAuthBypass(): boolean {
  return process.env.AUTH_DEV_BYPASS === "true";
}

/** Dev identity: AUTH_DEV_USER (default admin@bizone.vn), AUTH_DEV_ROLES, DEV_TENANT_ID. */
export function devBypassUser(now = Date.now()): AuthUser {
  const username = process.env.AUTH_DEV_USER?.trim() || "admin@bizone.vn";
  const roles = (process.env.AUTH_DEV_ROLES ?? "bizone-admin")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return {
    id: `dev-bypass:${username}`,
    username,
    email: username.includes("@") ? username : undefined,
    name: `${username} (dev)`,
    tenantId: process.env.DEV_TENANT_ID?.trim() || "tenant_demo",
    roles,
    resourceRoles: {},
    expiresAt: Math.floor(now / 1000) + DEV_TOKEN_TTL_SECONDS,
  };
}

/**
 * Single authentication entry point (proxy, tRPC, POS WebSocket): a real token → JWT verify;
 * no token / DEV_BYPASS_TOKEN → dev user when AUTH_DEV_BYPASS=true, otherwise rejected.
 */
export async function authenticateToken(token: string | null): Promise<JwtVerifyResult> {
  if (token && token !== DEV_BYPASS_TOKEN) return verifyJwt(token);
  if (!isDevAuthBypass()) return { ok: false, reason: token ? "invalid_token" : "missing_token" };
  if (!bypassWarned) {
    bypassWarned = true;
    console.warn(
      "[auth] AUTH_DEV_BYPASS=true — requests without a token run as the dev user. Never enable outside dev/test.",
    );
  }
  return { ok: true, user: devBypassUser() };
}
