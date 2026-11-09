import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateToken, DEV_BYPASS_TOKEN } from "@/lib/auth";
import { devBypassNotice, devTokenCanWrite, getDevAuthToken } from "@/lib/dev-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("dev auth bypass (P4.0)", () => {
  it("rejects requests without a token when bypass is off", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "");
    expect(await authenticateToken(null)).toEqual({ ok: false, reason: "missing_token" });
    expect((await authenticateToken(DEV_BYPASS_TOKEN)).ok).toBe(false);
  });

  it("maps no token / the placeholder token to the dev admin when bypass is on", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const token of [null, DEV_BYPASS_TOKEN]) {
      const r = await authenticateToken(token);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.user).toMatchObject({
          username: "payhub.admin@bizone.vn",
          roles: ["payhub-admin"],
        });
        expect(r.user.merchantId).toBeUndefined();
      }
    }
    expect((await authenticateToken("not-a-jwt")).ok).toBe(false); // real tokens still verified
  });

  it("scopes the dev user to AUTH_DEV_MERCHANT_ID and hides write actions for viewers", () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    vi.stubEnv("DEV_AUTH_TOKEN", "");
    expect(getDevAuthToken()).toBe(DEV_BYPASS_TOKEN);
    expect(devTokenCanWrite(DEV_BYPASS_TOKEN)).toBe(true);

    vi.stubEnv("AUTH_DEV_ROLES", "payhub-viewer");
    expect(devTokenCanWrite(DEV_BYPASS_TOKEN)).toBe(false);

    vi.stubEnv("AUTH_DEV_ROLES", "payhub-admin");
    vi.stubEnv("AUTH_DEV_MERCHANT_ID", "2");
    expect(devTokenCanWrite(DEV_BYPASS_TOKEN)).toBe(false);
    expect(devBypassNotice()).toMatchObject({ merchantId: "2" });
  });

  it("pages keep the real DEV_AUTH_TOKEN and show no notice when bypass is off", () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    vi.stubEnv("DEV_AUTH_TOKEN", "");
    expect(getDevAuthToken()).toBe("");
    expect(devBypassNotice()).toBeNull();
  });
});
