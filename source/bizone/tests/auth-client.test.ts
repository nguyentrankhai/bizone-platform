import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRefresh,
  decodeJwt,
  needsRefresh,
  parseStoredSession,
  pkceChallenge,
  randomToken,
  refreshAheadMs,
  safeReturnTo,
  sessionFromTokens,
} from "@/lib/auth-client";
import { sessionApiAuth, sessionUser } from "@/lib/session-client";
import { authenticateToken } from "@/lib/auth";

afterEach(() => vi.restoreAllMocks());

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
}

describe("PKCE (P6.7)", () => {
  it("S256 challenge = base64url(sha256(verifier)) — RFC 7636 appendix B", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    const v2 = randomToken(32);
    expect(await pkceChallenge(v2)).toBe(createHash("sha256").update(v2).digest("base64url"));
  });

  it("random tokens are url-safe and unique", () => {
    const a = randomToken(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(32)).not.toBe(a);
  });
});

describe("safeReturnTo", () => {
  it("keeps same-origin paths with query / hash", () => {
    expect(safeReturnTo("/orders/12?tab=items#x")).toBe("/orders/12?tab=items#x");
    expect(safeReturnTo("/mobile/dashboard")).toBe("/mobile/dashboard");
  });

  it("rejects open redirects and auth pages", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      "/auth/callback?code=1",
      "/\nx",
    ]) {
      expect(safeReturnTo(bad)).toBe("/");
    }
  });
});

describe("session tokens", () => {
  const now = 1_800_000_000_000;

  it("maps the token response to absolute expiry times; refresh keeps old id token", () => {
    const s = sessionFromTokens(
      {
        access_token: "a1",
        refresh_token: "r1",
        id_token: "i1",
        expires_in: 900,
        refresh_expires_in: 28800,
      },
      now,
    );
    expect(s).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
      idToken: "i1",
      expiresAt: now + 900_000,
      refreshExpiresAt: now + 28_800_000,
      lifetimeMs: 900_000,
    });
    const next = sessionFromTokens(
      { access_token: "a2", refresh_token: "r2", expires_in: 900 },
      now,
      s,
    );
    expect(next.idToken).toBe("i1");
    expect(next.refreshToken).toBe("r2");
    expect(next.refreshExpiresAt).toBe(0);
  });

  it("refresh timing", () => {
    const s = sessionFromTokens({ access_token: "a", refresh_token: "r", expires_in: 900 }, now);
    expect(needsRefresh(s, now, 30_000)).toBe(false);
    expect(needsRefresh(s, now + 880_000, 30_000)).toBe(true);
    expect(refreshAheadMs(s)).toBe(60_000);
    // 60 s token (test realm): refresh 15 s ahead, minimum validity capped at 30 s
    const short = sessionFromTokens({ access_token: "a", expires_in: 60 }, now);
    expect(refreshAheadMs(short)).toBe(15_000);
    expect(needsRefresh(short, now, 65_000)).toBe(false);
    expect(needsRefresh(short, now + 31_000, 65_000)).toBe(true);
    expect(canRefresh(s, now)).toBe(true); // 0 = no expiry
    expect(canRefresh({ ...s, refreshExpiresAt: now + 1_000 }, now)).toBe(false);
    expect(canRefresh({ ...s, refreshToken: "" }, now)).toBe(false);
  });

  it("parses stored sessions defensively", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("{oops")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ accessToken: "" }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ accessToken: "a", expiresAt: 5 }))).toEqual({
      accessToken: "a",
      refreshToken: "",
      idToken: "",
      expiresAt: 5,
      refreshExpiresAt: 0,
      lifetimeMs: 900_000,
    });
  });
});

describe("session user / API auth", () => {
  it("reads tenant, name and BizOne roles from the access token (UTF-8 names)", () => {
    const token = fakeJwt({
      sub: "u-1",
      preferred_username: "lan@shop.vn",
      name: "Nguyễn Thị Lan",
      tenant_id: "tenant_demo",
      realm_access: { roles: ["bizone-manager", "offline_access"] },
    });
    expect(decodeJwt(token)?.name).toBe("Nguyễn Thị Lan");
    expect(sessionUser(token)).toEqual({
      id: "u-1",
      username: "lan@shop.vn",
      name: "Nguyễn Thị Lan",
      email: undefined,
      tenantId: "tenant_demo",
      roles: ["bizone-manager"],
    });
    expect(sessionUser("garbage")).toBeNull();
  });

  it("falls back to the username when the token has no name claim", () => {
    expect(sessionUser(fakeJwt({ sub: "u", preferred_username: "seller" }))?.name).toBe("seller");
  });

  it("session API auth flags tRPC to fetch a fresh token", () => {
    const auth = sessionApiAuth("tenant_demo");
    expect(auth.session).toBe(true);
    expect(auth.tenantId).toBe("tenant_demo");
    expect(auth.authToken).toBe(""); // no browser session in tests
  });
});

describe("authenticateToken without dev bypass (P6.7)", () => {
  it("rejects a request without a token and the old placeholder token", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true"); // ignored: the bypass no longer exists
    expect(await authenticateToken(null)).toEqual({ ok: false, reason: "missing_token" });
    const r = await authenticateToken("dev-bypass");
    expect(r.ok).toBe(false);
    vi.unstubAllEnvs();
  });
});
