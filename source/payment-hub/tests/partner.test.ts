import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { PartnerConfig } from "@/generated/prisma/client";

beforeAll(() => {
  process.env.PARTNER_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

async function row(over: Partial<PartnerConfig>): Promise<PartnerConfig> {
  const { encryptSecret } = await import("@/lib/crypto");
  const now = new Date();
  return {
    id: 1,
    connectorType: "VNPay",
    name: "VNPay",
    apiKey: encryptSecret("TMNCODE123456"),
    secretKey: encryptSecret("SUPERSECRETHASHVALUE"),
    merchantCode: "TMNCODE1",
    endpointSandbox: null,
    endpointProduction: null,
    callbackUrl: null,
    webhookUrl: null,
    timeout: 30000,
    retryPolicy: null,
    status: "Inactive",
    environment: "Sandbox",
    testResult: null,
    lastTestedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as PartnerConfig;
}

describe("partner config view", () => {
  it("never exposes VNPay secrets", async () => {
    const { toView } = await import("@/server/services/partner.service");
    const view = toView(await row({}));
    expect(view.apiKey).toBe("••••3456");
    expect(view.secretKey).toBe("••••••••");
    expect(JSON.stringify(view)).not.toMatch(/SUPERSECRET|enc:v1:/);
  });

  it("shows non-secret VietQR fields (bank BIN, holder name)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    const { toView } = await import("@/server/services/partner.service");
    const view = toView(
      await row({
        connectorType: "VietQR",
        apiKey: encryptSecret("970436"),
        secretKey: encryptSecret("CONG TY ABC"),
      }),
    );
    expect(view.apiKey).toBe("970436");
    expect(view.secretKey).toBe("CONG TY ABC");
  });
});
