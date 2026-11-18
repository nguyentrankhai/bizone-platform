import { createRemoteJWKSet, jwtVerify } from "jose";
import type { PayhubAuthUser, PayhubKeycloakToken } from "@/types/auth";
import { getRedis } from "@/lib/redis";

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
      sessionId: claims.sid,
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

// ─── Single entry point + logout revocation (P6.7) ────────────────────────────
// Logging out ends the Keycloak session (no new tokens) and `/api/auth/logout` marks the token's
// session id (`sid`) revoked in Redis until the token expires — a copied token stops working.

const REVOKED_PREFIX = "payhub:auth:revoked:";

/** Mark a Keycloak session's tokens revoked until `expiresAt` (epoch seconds). */
export async function revokeSession(sessionId: string, expiresAt: number): Promise<void> {
  const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  await getRedis().set(`${REVOKED_PREFIX}${sessionId}`, "1", "EX", ttl);
}

async function isSessionRevoked(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return false;
  try {
    return (await getRedis().exists(`${REVOKED_PREFIX}${sessionId}`)) === 1;
  } catch {
    return false; // Redis down: the token lifetime still bounds a revoked token
  }
}

/**
 * Single authentication entry point (proxy, admin pages, realtime WebSocket): verify the
 * Keycloak JWT and reject tokens of a session that logged out. No token → rejected.
 * The merchant API (X-Api-Key + HMAC) and IPN/webhook callbacks never go through here.
 */
export async function authenticateToken(token: string | null): Promise<JwtVerifyResult> {
  if (!token) return { ok: false, reason: "missing_token" };
  const result = await verifyJwt(token);
  if (result.ok && (await isSessionRevoked(result.user.sessionId))) {
    return { ok: false, reason: "session_revoked" };
  }
  return result;
}
