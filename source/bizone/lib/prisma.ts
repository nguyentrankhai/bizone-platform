import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 10,
  });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so each edit doesn't open a new pool.
const globalForPrisma = globalThis as unknown as { bizonePrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.bizonePrisma ??= createPrismaClient();
  return globalForPrisma.bizonePrisma;
}
