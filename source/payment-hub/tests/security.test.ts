import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { canReceive } from "@/lib/events";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/crypto";
import { issueApiKey } from "@/lib/api-keys";
import { requireAdmin } from "@/server/middleware/adminAuth";

afterEach(() => vi.unstubAllEnvs());

const req = (headers: Record<string, string>) =>
  ({ headers: new Headers(headers) }) as unknown as NextRequest;

describe("requireAdmin (internal API)", () => {
  it("401 without identity, 403 without an admin role", async () => {
    expect(((await requireAdmin(req({}))) as Response).status).toBe(401);
    const r = requireAdmin(req({ "x-user-id": "u", "x-user-roles": "offline_access" }));
    expect((r as Response).status).toBe(403);
  });

  it("allows admin/viewer and scopes merchant-bound tokens", () => {
    expect(requireAdmin(req({ "x-user-id": "u", "x-user-roles": "payhub-viewer" }))).toEqual({
      userId: "u",
      roles: ["payhub-viewer"],
      merchantId: undefined,
    });
    const scoped = requireAdmin(
      req({ "x-user-id": "u", "x-user-roles": "payhub-admin", "x-merchant-id": "7" }),
    );
    expect(scoped).toMatchObject({ merchantId: 7 });
    const bad = requireAdmin(
      req({ "x-user-id": "u", "x-user-roles": "payhub-admin", "x-merchant-id": "7 OR 1" }),
    );
    expect((bad as Response).status).toBe(403);
  });
});

describe("realtime fan-out", () => {
  const ev = (merchantId: number) => ({ type: "t", data: { merchantId }, at: "" });
  it("sends everything to unscoped admins and only own events to merchants", () => {
    expect(canReceive({}, ev(1))).toBe(true);
    expect(canReceive({ merchantId: 1 }, ev(1))).toBe(true);
    expect(canReceive({ merchantId: 1 }, ev(2))).toBe(false);
    expect(canReceive({ merchantId: 1 }, { type: "connected", data: null, at: "" })).toBe(false);
  });
});

describe("API secrets at rest", () => {
  it("issues keys whose stored secret is encrypted and recoverable", () => {
    vi.stubEnv("PARTNER_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const k = issueApiKey();
    expect(k.apiKey).toMatch(/^pk_[0-9a-f]{32}$/);
    expect(isEncrypted(k.storedSecret)).toBe(true);
    expect(k.storedSecret).not.toContain(k.apiSecret);
    expect(decryptSecret(k.storedSecret)).toBe(k.apiSecret);
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
  });
});
