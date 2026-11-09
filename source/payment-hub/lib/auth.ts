import { createRemoteJWKSet, jwtVerify } from "jose";
import type { PayhubAuthUser, PayhubKeycloakToken } from "@/types/auth";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "payment-hub";
const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;
const ISSUER = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;

/**
 * Clients whose tokens this app accepts (`azp` claim). Any other client of the realm — even
 * with a valid signature — is rejected. Override with KEYCLOAK_ALLOWED_CLIENTS (comma list).
 */
const ALLOWED_CLIENTS = new Set(
  (process.env.KEYCLOAK_ALLOWED_CLIENTS ?? "payhub-admin-console,payhub-api")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),
);

const getJWKS = (() => {
  let cached: ReturnType<typeof createRemoteJWKSet> | null = null;
  return () => {
    cached ??= createRemoteJWKSet(new URL(JWKS_URL));
    return cached;
  };
})();

export type JwtVerifyResult = { ok: true; user: PayhubAuthUser } | { ok: false; reason: string };

export async function verifyJwt(token: string): Promise<JwtVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: ISSUER,
    });

    const claims = payload as unknown as PayhubKeycloakToken;

    if (!claims.azp || !ALLOWED_CLIENTS.has(claims.azp)) {
      return { ok: false, reason: "client_not_allowed" };
    }

    const realmRoles = claims.realm_access?.roles ?? [];
    const resourceRoles = Object.fromEntries(
      Object.entries(claims.resource_access ?? {}).map(([k, v]) => [k, v.roles]),
    );
    const allRoles = [...realmRoles, ...Object.values(resourceRoles).flat()];

    const user: PayhubAuthUser = {
      id: claims.sub,
      username: claims.preferred_username,
      email: claims.email,
      name: claims.name,
      merchantId: claims.merchant_id,
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
// Admin browser login (Keycloak OIDC) is not built yet (PROGRESS #7, P6.7). With
// AUTH_DEV_BYPASS=true an admin request WITHOUT a token (or with the placeholder token below)
// runs as a configured dev user; a real token is still fully verified. The merchant API
// (X-Api-Key + HMAC) and IPN/webhook callbacks never go through here. Remove with P6.7.

/** Placeholder token pages hand to clients when bypass is on (WS subprotocols can't be empty). */
export const DEV_BYPASS_TOKEN = "dev-bypass";

const DEV_TOKEN_TTL_SECONDS = 12 * 60 * 60;
let bypassWarned = false;

export function isDevAuthBypass(): boolean {
  return process.env.AUTH_DEV_BYPASS === "true";
}

/** Dev identity: AUTH_DEV_USER, AUTH_DEV_ROLES (default payhub-admin), AUTH_DEV_MERCHANT_ID. */
export function devBypassUser(now = Date.now()): PayhubAuthUser {
  const username = process.env.AUTH_DEV_USER?.trim() || "payhub.admin@bizone.vn";
  const roles = (process.env.AUTH_DEV_ROLES ?? "payhub-admin")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return {
    id: `dev-bypass:${username}`,
    username,
    email: username.includes("@") ? username : undefined,
    name: `${username} (dev)`,
    merchantId: process.env.AUTH_DEV_MERCHANT_ID?.trim() || undefined,
    roles,
    resourceRoles: {},
    expiresAt: Math.floor(now / 1000) + DEV_TOKEN_TTL_SECONDS,
  };
}

/**
 * Single authentication entry point (proxy, realtime WebSocket): a real token → JWT verify;
 * no token / DEV_BYPASS_TOKEN → dev user when AUTH_DEV_BYPASS=true, otherwise rejected.
 */
export async function authenticateToken(token: string | null): Promise<JwtVerifyResult> {
  if (token && token !== DEV_BYPASS_TOKEN) return verifyJwt(token);
  if (!isDevAuthBypass()) return { ok: false, reason: token ? "invalid_token" : "missing_token" };
  if (!bypassWarned) {
    bypassWarned = true;
    console.warn(
      "[auth] AUTH_DEV_BYPASS=true — admin requests without a token run as the dev user. Never enable outside dev/test.",
    );
  }
  return { ok: true, user: devBypassUser() };
}
