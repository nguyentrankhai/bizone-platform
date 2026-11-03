import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL is not set");
const url = new URL(raw);

const pool = createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Admin user (password: admin123 — change immediately in production)
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@paymenthub.local",
      passwordHash: "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
      fullName: "System Administrator",
      role: "Admin",
      status: "Active",
    },
  });

  // Default BizOne merchant
  await prisma.merchant.upsert({
    where: { code: "BIZONE" },
    update: {},
    create: {
      name: "BizOne Default",
      code: "BIZONE",
      contactName: "BizOne Admin",
      contactEmail: "admin@bizone.local",
      contactPhone: "0900000000",
      status: "Active",
    },
  });

  // Pre-install known connectors
  const connectors = [
    {
      code: "vnpay",
      name: "VNPay",
      version: "1.0.0",
      description: "VNPay payment gateway connector",
    },
    { code: "momo", name: "MoMo", version: "1.0.0", description: "MoMo e-wallet connector" },
    {
      code: "zalopay",
      name: "ZaloPay",
      version: "1.0.0",
      description: "ZaloPay e-wallet connector",
    },
    {
      code: "vietqr",
      name: "VietQR",
      version: "1.0.0",
      description: "VietQR Bank Transfer connector",
    },
  ];

  for (const c of connectors) {
    await prisma.connector.upsert({
      where: { code: c.code },
      update: {},
      create: {
        name: c.name,
        code: c.code,
        version: c.version,
        description: c.description,
        status: "Not_Installed",
        isActive: false,
      },
    });
  }

  console.log("Seed completed: 1 admin, 1 merchant, 4 connectors");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
