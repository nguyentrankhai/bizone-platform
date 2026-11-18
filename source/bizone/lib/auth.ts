import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthUser, KeycloakToken } from "@/types/auth";
import { getRedis } from "@/lib/redis";

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
// Keycloak access tokens are stateless JWTs valid for 15 minutes. Logging out ends the Keycloak
// session (no new tokens), and `/api/auth/logout` also marks the token's session id (`sid`)
// revoked in Redis until the token expires — so a copied token stops working at once.

const REVOKED_PREFIX = "auth:revoked:";

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
    return false; // Redis down: the 15-minute token lifetime still bounds a revoked token
  }
}

/**
 * Single authentication entry point (proxy, tRPC, WebSockets, route handlers): verify the
 * Keycloak JWT and reject tokens of a session that logged out. No token → rejected.
 */
export async function authenticateToken(token: string | null): Promise<JwtVerifyResult> {
  if (!token) return { ok: false, reason: "missing_token" };
  const result = await verifyJwt(token);
  if (result.ok && (await isSessionRevoked(result.user.sessionId))) {
    return { ok: false, reason: "session_revoked" };
  }
  return result;
}
