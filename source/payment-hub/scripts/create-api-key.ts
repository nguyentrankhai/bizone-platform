/**
 * Issue a merchant API key (dev/ops tool until the merchant console exists).
 *   npm run apikey:create -- <MERCHANT_CODE> [name]
 * Prints the key and secret once; only the encrypted secret is stored.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { existsSync } from "node:fs";
import { issueApiKey } from "../lib/api-keys";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const [merchantCode, name = "Default"] = process.argv.slice(2);
  if (!merchantCode) throw new Error("Usage: npm run apikey:create -- <MERCHANT_CODE> [name]");

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  });

  try {
    const merchant = await prisma.merchant.findUnique({ where: { code: merchantCode } });
    if (!merchant) throw new Error(`Merchant "${merchantCode}" not found`);

    const issued = issueApiKey();
    const key = await prisma.apiKey.create({
      data: {
        merchantId: merchant.id,
        apiKey: issued.apiKey,
        apiSecret: issued.storedSecret,
        name,
      },
    });
    console.log(
      JSON.stringify({
        id: key.id,
        merchant: merchant.code,
        api_key: issued.apiKey,
        api_secret: issued.apiSecret,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
