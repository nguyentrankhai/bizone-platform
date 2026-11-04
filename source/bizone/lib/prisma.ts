import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { currentTenantId, tenantDatabase } from "@/lib/tenant";

/**
 * One Prisma client (and connection pool) per tenant database. `DATABASE_URL` supplies host
 * and credentials; the database comes from the tenant registry (lib/tenant.ts).
 */
function createPrismaClient(database: string): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: Number(process.env.DB_POOL_PER_TENANT ?? 5),
  });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so each edit doesn't open new pools.
const globalForPrisma = globalThis as unknown as { bizonePrismaByDb?: Map<string, PrismaClient> };

/** Prisma client of an explicit tenant (scripts, health checks). */
export function getPrismaForTenant(tenantId: string): PrismaClient {
  const database = tenantDatabase(tenantId);
  globalForPrisma.bizonePrismaByDb ??= new Map();
  let client = globalForPrisma.bizonePrismaByDb.get(database);
  if (!client) {
    client = createPrismaClient(database);
    globalForPrisma.bizonePrismaByDb.set(database, client);
  }
  return client;
}

/**
 * Prisma client of the current tenant (set by `runWithTenant()` in tRPC, the POS WebSocket
 * and the worker). Throws outside a tenant scope — there is no shared default database.
 */
export function getPrisma(): PrismaClient {
  return getPrismaForTenant(currentTenantId());
}
