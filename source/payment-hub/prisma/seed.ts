import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";
import { existsSync } from "node:fs";
import { encryptSecret } from "../lib/crypto";

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

  // VNPay sandbox partner config (P3.3) — only when credentials + encryption key exist.
  // TMN code / HashSecret are stored AES-256-GCM encrypted (lib/crypto.ts).
  let vnpay = "skipped (VNPAY_TMN_CODE / VNPAY_HASH_SECRET / PARTNER_ENCRYPTION_KEY not set)";
  const tmn = process.env.VNPAY_TMN_CODE;
  const hashSecret = process.env.VNPAY_HASH_SECRET;
  if (tmn && hashSecret && process.env.PARTNER_ENCRYPTION_KEY) {
    const appUrl = process.env.APP_URL ?? "http://localhost:4000";
    const data = {
      connectorType: "VNPay",
      name: "VNPay Sandbox",
      apiKey: encryptSecret(tmn),
      secretKey: encryptSecret(hashSecret),
      merchantCode: tmn,
      endpointSandbox:
        process.env.VNPAY_URL ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
      endpointProduction: "https://pay.vnpay.vn/vpcpay.html",
      callbackUrl: `${appUrl}/pay/vnpay/return`,
      webhookUrl: `${appUrl}/api/ipn/vnpay`,
      timeout: 30000,
      status: "Active" as const,
      environment: "Sandbox" as const,
    };
    const existing = await prisma.partnerConfig.findFirst({
      where: { connectorType: "VNPay", environment: "Sandbox" },
    });
    if (existing) await prisma.partnerConfig.update({ where: { id: existing.id }, data });
    else await prisma.partnerConfig.create({ data });
    await prisma.connector.update({
      where: { code: "vnpay" },
      data: { status: "Installed", isActive: true },
    });
    vnpay = "VNPay Sandbox partner config upserted";
  }

  // VietQR partner config (P3.4) — beneficiary bank account for bank-transfer QR.
  // api_key = bank BIN, merchant_code = account number, secret_key = account holder name
  // (see VIETQR_CONFIG_FIELDS in server/services/qr.service.ts).
  let vietqr = "skipped (VIETQR_BANK_BIN / VIETQR_ACCOUNT_NO / VIETQR_ACCOUNT_NAME not set)";
  const bin = process.env.VIETQR_BANK_BIN;
  const accountNo = process.env.VIETQR_ACCOUNT_NO;
  const accountName = process.env.VIETQR_ACCOUNT_NAME;
  if (bin && accountNo && accountName && process.env.PARTNER_ENCRYPTION_KEY) {
    const data = {
      connectorType: "VietQR",
      name: process.env.VIETQR_CONFIG_NAME ?? "VietQR",
      apiKey: encryptSecret(bin),
      secretKey: encryptSecret(accountName),
      merchantCode: accountNo,
      timeout: 30000,
      status: "Active" as const,
      environment: "Production" as const, // no sandbox: VietQR is a static NAPAS standard
    };
    const existing = await prisma.partnerConfig.findFirst({ where: { connectorType: "VietQR" } });
    if (existing) await prisma.partnerConfig.update({ where: { id: existing.id }, data });
    else await prisma.partnerConfig.create({ data });
    await prisma.connector.update({
      where: { code: "vietqr" },
      data: { status: "Installed", isActive: true },
    });
    vietqr = "VietQR partner config upserted";
  }

  console.log(`Seed completed: 1 admin, 1 merchant, 4 connectors; ${vnpay}; ${vietqr}`);
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
