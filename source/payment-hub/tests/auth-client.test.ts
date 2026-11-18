import { afterEach, describe, expect, it, vi } from "vitest";
import { pkceChallenge, safeReturnTo, sessionFromTokens, needsRefresh } from "@/lib/auth-client";
import { sessionUser } from "@/lib/session-client";
import { authenticateToken } from "@/lib/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
}

describe("admin console sign-in (P6.7)", () => {
  it("PKCE S256 matches RFC 7636 appendix B", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("returns only to same-origin paths", () => {
    expect(safeReturnTo("/transactions/12?dispute=1")).toBe("/transactions/12?dispute=1");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
  });

  it("30-minute realm tokens refresh before expiry", () => {
    const now = 1_800_000_000_000;
    const s = sessionFromTokens({ access_token: "a", refresh_token: "r", expires_in: 1800 }, now);
    expect(needsRefresh(s, now + 1_700_000, 30_000)).toBe(false);
    expect(needsRefresh(s, now + 1_780_000, 30_000)).toBe(true);
  });

  it("reads payhub roles and the merchant binding from the token", () => {
    const user = sessionUser(
      fakeJwt({
        sub: "u",
        preferred_username: "ops@shop.vn",
        name: "Vận hành",
        merchant_id: 7,
        realm_access: { roles: ["payhub-viewer", "offline_access"] },
      }),
    );
    expect(user).toMatchObject({ name: "Vận hành", roles: ["payhub-viewer"], merchantId: "7" });
  });

  it("no dev bypass: no token / placeholder token → rejected", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    expect(await authenticateToken(null)).toEqual({ ok: false, reason: "missing_token" });
    expect((await authenticateToken("dev-bypass")).ok).toBe(false);
  });
});
