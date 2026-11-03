// JWT claims from Keycloak access token (payment-hub realm)
export interface PayhubKeycloakToken {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;
  typ: string;
  azp: string;
  preferred_username: string;
  email?: string;
  name?: string;
  // Payment Hub custom claims
  merchant_id?: string;
  // Role mappings
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  scope?: string;
}

export interface PayhubAuthUser {
  id: string;
  username: string;
  email?: string;
  name?: string;
  merchantId?: string;
  roles: string[];
  resourceRoles: Record<string, string[]>;
}

export type PayhubPermission =
  | "transaction:write"
  | "transaction:read"
  | "refund:write"
  | "refund:read"
  | "webhook:write"
  | "webhook:read"
  | "report:read"
  | "connector:write"
  | "connector:read"
  | "admin:*";
