import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";

function createPrismaClient(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    // P7.4: pool per process — instances × DB_POOL_SIZE must stay below MariaDB max_connections
    connectionLimit: poolSize(),
    acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT_MS) || 5000,
  });
  const adapter = new PrismaMariaDb(pool);
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { payhubPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.payhubPrisma ??= createPrismaClient();
  return globalForPrisma.payhubPrisma;
}

function poolSize(): number {
  const n = Number(process.env.DB_POOL_SIZE);
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : 10;
}
