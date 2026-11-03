import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env files itself. Variables already set in the shell win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Optional so `prisma generate` works without a database (e.g. during `docker build`).
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
