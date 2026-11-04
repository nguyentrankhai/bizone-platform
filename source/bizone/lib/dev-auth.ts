// In production, tenantId and authToken come from the Keycloak session (not wired yet — see P2.2).
// For dev, pages read them from env so client components can call tRPC.
export function getDevAuth() {
  return {
    tenantId: process.env.DEV_TENANT_ID ?? "tenant_demo",
    authToken: process.env.DEV_AUTH_TOKEN ?? "",
  };
}
