import { createPool, type Pool } from "mariadb";

function createDbPool(): Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  return createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    // P7.4: pool per process — instances × DB_POOL_SIZE must stay below MariaDB max_connections
    connectionLimit: poolSize(),
    acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT_MS) || 5000,
  });
}

// Reused across hot reloads in dev so each edit doesn't open a new pool.
const globalForDb = globalThis as unknown as { payhubDb?: Pool };

export function getDb(): Pool {
  globalForDb.payhubDb ??= createDbPool();
  return globalForDb.payhubDb;
}

function poolSize(): number {
  const n = Number(process.env.DB_POOL_SIZE);
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : 10;
}
