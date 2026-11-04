import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Multi-tenant isolation — one database per tenant (SRS-NFR-14 / NFR-19, AC-SEC-04).
 *
 * The tenant of the current request/job/socket message is carried in AsyncLocalStorage:
 * entry points (tRPC middleware, POS WebSocket, BullMQ worker, route handlers) call
 * `runWithTenant()`, and `getPrisma()` / Redis key helpers read `currentTenantId()`.
 * Anything that touches tenant data outside a tenant scope throws (fail closed) instead of
 * silently falling back to a shared database.
 *
 * Tenant → database registry: env `TENANT_DATABASES`, a comma list of `tenantId=database`
 * (e.g. `tenant_demo=bizonedb,acme=bizone_acme`). Host and credentials come from
 * `DATABASE_URL`; only the database name changes. Tenants not listed are rejected.
 */

const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DB_NAME_RE = /^[A-Za-z0-9_]{1,64}$/;

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

let cachedRegistry: { raw: string; map: Map<string, string> } | null = null;

/** Parsed `TENANT_DATABASES` (re-parsed only when the env value changes). */
export function tenantRegistry(): Map<string, string> {
  const raw = process.env.TENANT_DATABASES ?? "";
  if (cachedRegistry?.raw === raw) return cachedRegistry.map;

  const map = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [tenantId, database] = trimmed.split("=").map((s) => s.trim());
    if (!tenantId || !database || !TENANT_ID_RE.test(tenantId) || !DB_NAME_RE.test(database)) {
      throw new TenantError(`Invalid TENANT_DATABASES entry "${trimmed}"`);
    }
    map.set(tenantId, database);
  }
  cachedRegistry = { raw, map };
  return map;
}

export function isKnownTenant(tenantId: string | null | undefined): tenantId is string {
  return !!tenantId && TENANT_ID_RE.test(tenantId) && tenantRegistry().has(tenantId);
}

/** Database name of a provisioned tenant; throws for unknown tenants. */
export function tenantDatabase(tenantId: string): string {
  const db = isKnownTenant(tenantId) ? tenantRegistry().get(tenantId) : undefined;
  if (!db) throw new TenantError(`Tenant "${tenantId}" is not provisioned`);
  return db;
}

const storage = new AsyncLocalStorage<{ tenantId: string }>();

/** Run `fn` with `tenantId` as the current tenant (validated against the registry). */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  tenantDatabase(tenantId); // fail fast on unknown tenants
  return storage.run({ tenantId }, fn);
}

/** Current tenant, or throws when called outside `runWithTenant()`. */
export function currentTenantId(): string {
  const store = storage.getStore();
  if (!store) throw new TenantError("No tenant in scope (missing runWithTenant)");
  return store.tenantId;
}
