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
    connectionLimit: 5,
    acquireTimeout: 5000,
  });
}

// Reused across hot reloads in dev so each edit doesn't open a new pool.
const globalForDb = globalThis as unknown as { payhubDb?: Pool };

export function getDb(): Pool {
  globalForDb.payhubDb ??= createDbPool();
  return globalForDb.payhubDb;
}
