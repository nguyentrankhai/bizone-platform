// JWT claims from Keycloak access token (bizone realm)
export interface KeycloakToken {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;
  typ: string;
  azp: string;
  // Keycloak standard claims
  preferred_username: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  // BizOne custom claims
  tenant_id: string;
  // Role mappings
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  scope?: string;
}

export interface AuthUser {
  id: string; // sub
  username: string; // preferred_username
  email?: string;
  name?: string;
  tenantId: string;
  roles: string[]; // merged realm + resource roles
  resourceRoles: Record<string, string[]>;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  roles: string[];
}

export type Permission =
  | "pos:write"
  | "pos:read"
  | "product:write"
  | "product:read"
  | "inventory:write"
  | "inventory:read"
  | "order:write"
  | "order:read"
  | "crm:write"
  | "crm:read"
  | "report:read"
  | "staff:write"
  | "staff:read"
  | "admin:*";
