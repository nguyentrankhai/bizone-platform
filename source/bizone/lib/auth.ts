import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthUser, KeycloakToken } from "@/types/auth";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "bizone";
const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;
const ISSUER = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;

// Cache JWKS set — createRemoteJWKSet handles 24h caching + kid-miss refresh internally
const getJWKS = (() => {
  let cached: ReturnType<typeof createRemoteJWKSet> | null = null;
  return () => {
    cached ??= createRemoteJWKSet(new URL(JWKS_URL));
    return cached;
  };
})();

export type JwtVerifyResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: string };

export async function verifyJwt(token: string): Promise<JwtVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: ISSUER,
      // audience check: skip here — bizone-frontend is public client, no audience claim
    });

    const claims = payload as unknown as KeycloakToken;

    if (!claims.tenant_id) {
      return { ok: false, reason: "missing_tenant_id_claim" };
    }

    const realmRoles = claims.realm_access?.roles ?? [];
    const resourceRoles = Object.fromEntries(
      Object.entries(claims.resource_access ?? {}).map(([k, v]) => [k, v.roles]),
    );
    const allRoles = [
      ...realmRoles,
      ...Object.values(resourceRoles).flat(),
    ];

    const user: AuthUser = {
      id: claims.sub,
      username: claims.preferred_username,
      email: claims.email,
      name: claims.name,
      tenantId: claims.tenant_id,
      roles: [...new Set(allRoles)],
      resourceRoles,
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
