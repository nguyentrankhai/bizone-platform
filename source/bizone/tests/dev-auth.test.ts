import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateToken, DEV_BYPASS_TOKEN, devBypassUser } from "@/lib/auth";
import { devAuthProblem, devBypassNotice, getDevAuth } from "@/lib/dev-auth";
import { hasPermission } from "@/lib/rbac";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
}

describe("dev auth bypass (P4.0)", () => {
  it("rejects requests without a token when bypass is off", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    expect(await authenticateToken(null)).toEqual({ ok: false, reason: "missing_token" });
    expect(await authenticateToken(DEV_BYPASS_TOKEN)).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("maps no token / the placeholder token to the dev user when bypass is on", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const token of [null, DEV_BYPASS_TOKEN]) {
      const r = await authenticateToken(token);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.user.username).toBe("admin@bizone.vn");
        expect(r.user.tenantId).toBe("tenant_demo");
        expect(hasPermission(r.user, "staff:write")).toBe(true);
        expect(r.user.expiresAt * 1000).toBeGreaterThan(Date.now());
      }
    }
  });

  it("still verifies a real token even when bypass is on", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    const r = await authenticateToken("not-a-jwt");
    expect(r.ok).toBe(false);
  });

  it("builds the dev user from env", () => {
    vi.stubEnv("AUTH_DEV_USER", "demo.seller@bizone.vn");
    vi.stubEnv("AUTH_DEV_ROLES", "bizone-seller");
    vi.stubEnv("DEV_TENANT_ID", "acme");
    const u = devBypassUser();
    expect(u).toMatchObject({ username: "demo.seller@bizone.vn", tenantId: "acme" });
    expect(u.roles).toEqual(["bizone-seller"]);
    expect(hasPermission(u, "pos:write")).toBe(true);
    expect(hasPermission(u, "staff:write")).toBe(false);
  });

  it("pages get the placeholder token only when bypass is on and DEV_AUTH_TOKEN is unset", () => {
    vi.stubEnv("DEV_AUTH_TOKEN", "");
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    expect(getDevAuth().authToken).toBe("");
    expect(devAuthProblem()).toBe("missing");
    expect(devBypassNotice()).toBeNull();

    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    expect(getDevAuth().authToken).toBe(DEV_BYPASS_TOKEN);
    expect(devAuthProblem()).toBeNull();
    expect(devBypassNotice()).toEqual({ username: "admin@bizone.vn", roles: ["bizone-admin"] });

    // A stale real token is kept (and reported) — remove it to fall back to the dev user
    const expired = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    vi.stubEnv("DEV_AUTH_TOKEN", expired);
    expect(getDevAuth().authToken).toBe(expired);
    expect(devAuthProblem()).toBe("expired");

    const valid = fakeJwt({
      exp: Math.floor(Date.now() / 1000) + 600,
      preferred_username: "demo.manager@bizone.vn",
      realm_access: { roles: ["bizone-manager", "offline_access"] },
    });
    vi.stubEnv("DEV_AUTH_TOKEN", valid);
    expect(getDevAuth().authToken).toBe(valid);
    expect(devBypassNotice()).toEqual({
      username: "demo.manager@bizone.vn",
      roles: ["bizone-manager"],
    });
  });
});
