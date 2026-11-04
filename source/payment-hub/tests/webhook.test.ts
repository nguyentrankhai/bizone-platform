import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  assertDeliverableUrl,
  signWebhook,
  verifyWebhookSignature,
} from "@/services/webhook/sender";
import { webhookBackoff, type WebhookJob } from "@/services/webhook/queue";
import { deliveryIdFor, generateWebhookSecret } from "@/server/services/webhook.service";

describe("webhook signature", () => {
  it("is HMAC-SHA256(secret, `${timestamp}.${body}`) in hex", () => {
    const body = '{"event":"payment.success"}';
    const expected = createHmac("sha256", "whsec_x").update(`1762240000.${body}`).digest("hex");
    expect(signWebhook("whsec_x", "1762240000", body)).toBe(expected);
    expect(verifyWebhookSignature("whsec_x", "1762240000", body, expected)).toBe(true);
    expect(verifyWebhookSignature("whsec_x", "1762240001", body, expected)).toBe(false);
    expect(verifyWebhookSignature("whsec_y", "1762240000", body, expected)).toBe(false);
    expect(verifyWebhookSignature("whsec_x", "1762240000", body + " ", expected)).toBe(false);
  });

  it("generates whsec_ secrets with 192 bits of entropy", () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(generateWebhookSecret()).not.toBe(s);
  });
});

describe("delivery id", () => {
  it("is a stable UUID per (transaction, event)", () => {
    const a = deliveryIdFor("TXN-20261104-ABC123", "payment.success");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deliveryIdFor("TXN-20261104-ABC123", "payment.success")).toBe(a);
    expect(deliveryIdFor("TXN-20261104-ABC123", "payment.failed")).not.toBe(a);
  });
});

describe("retry backoff", () => {
  const job = (retryIntervals: number[]) => ({ data: { retryIntervals } as WebhookJob });
  it("follows 1m, 5m, 15m, 1h, 6h and repeats the last interval", () => {
    const j = job([60, 300, 900, 3600, 21600]);
    expect([1, 2, 3, 4, 5, 6].map((n) => webhookBackoff(n, j))).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 21_600_000, 21_600_000,
    ]);
  });
});

describe("SSRF guard", () => {
  const prev = process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
  afterEach(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = prev;
  });

  it("blocks private / loopback destinations and plain http unless allowed", async () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    for (const url of [
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://192.168.1.10/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://localhost/hook",
      "http://93.184.216.34/hook",
      "ftp://example.com/hook",
    ]) {
      await expect(assertDeliverableUrl(url), url).rejects.toThrow();
    }
    await expect(assertDeliverableUrl("https://93.184.216.34/hook")).resolves.toBeUndefined();
  });

  it("allows private networks when WEBHOOK_ALLOW_PRIVATE_NETWORKS=true (dev)", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    await expect(
      assertDeliverableUrl("http://localhost:3000/api/webhooks/payhub"),
    ).resolves.toBeUndefined();
  });
});
