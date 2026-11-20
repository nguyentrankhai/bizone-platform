import { describe, expect, it } from "vitest";
import {
  blocksCrossSiteWrite,
  buildCsp,
  checkOrigin,
  httpsRedirectUrl,
  isHttpsRequest,
  originList,
  permissionsPolicy,
  preflightHeaders,
  securityHeaders,
} from "@/lib/security/http";

const h = (o: Record<string, string>) => new Headers(o);
const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe("P6.6 CSP", () => {
  it("keeps every directive locked down in production (PPR mode)", () => {
    const csp = buildCsp({
      dev: false,
      https: true,
      connectSrc: ["http://localhost:8080", "ws://localhost:3002"],
    });
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "http://localhost:8080",
      "ws://localhost:3002",
    ]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "upgrade-insecure-requests")).toEqual([]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("strict nonce mode drops 'unsafe-inline' scripts (storefront)", () => {
    const csp = buildCsp({ dev: false, https: false, nonce: "abc123" });
    expect(directive(csp, "script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(directive(csp, "upgrade-insecure-requests")).toBeUndefined();
  });

  it("allows eval only in next dev and drops empty / duplicate origins", () => {
    const csp = buildCsp({ dev: true, https: false, connectSrc: ["", "'self'", "http://a:1"] });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toEqual(["'self'", "http://a:1"]);
  });

  it("parses origin lists from env", () => {
    expect(originList(" https://a.vn/x , http://b:3000  junk ")).toEqual([
      "https://a.vn",
      "http://b:3000",
    ]);
    expect(originList(undefined)).toEqual([]);
  });
});

describe("P6.6 Helmet-style headers", () => {
  it("sets the standard headers, HSTS only over https", () => {
    const plain = securityHeaders({ csp: "x", https: false });
    expect(plain["X-Content-Type-Options"]).toBe("nosniff");
    expect(plain["X-Frame-Options"]).toBe("DENY");
    expect(plain["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(plain["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(plain["Cross-Origin-Resource-Policy"]).toBe("same-site");
    expect(plain["Strict-Transport-Security"]).toBeUndefined();
    expect(securityHeaders({ csp: "x", https: true })["Strict-Transport-Security"]).toMatch(
      /max-age=31536000/,
    );
    expect(securityHeaders({ csp: "x", https: false, corp: null })).not.toHaveProperty(
      "Cross-Origin-Resource-Policy",
    );
  });

  it("denies powerful features except the ones the app needs", () => {
    const p = permissionsPolicy(["usb=(self)", "bluetooth=(self)"]);
    expect(p).toContain("usb=(self)");
    expect(p).toContain("bluetooth=(self)");
    expect(p).toContain("camera=()");
    expect(p).toContain("geolocation=()");
    expect(p).not.toContain("usb=()");
  });
});

describe("P6.6 HTTPS", () => {
  it("trusts X-Forwarded-Proto only behind a trusted proxy", () => {
    expect(isHttpsRequest(h({ "x-forwarded-proto": "https" }), "http:", false)).toBe(false);
    expect(isHttpsRequest(h({ "x-forwarded-proto": "https" }), "http:", true)).toBe(true);
    expect(isHttpsRequest(h({ "x-forwarded-proto": "http" }), "https:", true)).toBe(false);
    expect(isHttpsRequest(h({}), "https:", false)).toBe(true);
  });

  it("redirects plain http when forced, except the health check", () => {
    const url = new URL("http://shop.bizone.vn/dashboard?x=1");
    const headers = h({ host: "shop.bizone.vn" });
    expect(httpsRedirectUrl(url, headers, { force: true, https: false })).toBe(
      "https://shop.bizone.vn/dashboard?x=1",
    );
    expect(httpsRedirectUrl(url, headers, { force: true, https: true })).toBeNull();
    expect(httpsRedirectUrl(url, headers, { force: false, https: false })).toBeNull();
    expect(
      httpsRedirectUrl(new URL("http://x/api/health"), headers, { force: true, https: false }),
    ).toBeNull();
  });
});

describe("P6.6 CORS whitelist + cross-site writes", () => {
  const allowed = ["https://partner.vn"];
  it("classifies origins", () => {
    expect(checkOrigin(null, "app.vn", allowed)).toBe("none");
    expect(checkOrigin("https://app.vn", "app.vn", allowed)).toBe("same");
    expect(checkOrigin("http://localhost:3000", "localhost:3000", allowed)).toBe("same");
    expect(checkOrigin("https://partner.vn", "app.vn", allowed)).toBe("allowed");
    expect(checkOrigin("https://evil.example", "app.vn", allowed)).toBe("denied");
    expect(checkOrigin("null", "app.vn", allowed)).toBe("denied");
    expect(checkOrigin("http://localhost:3001", "localhost:3000", allowed)).toBe("denied");
  });

  it("blocks state-changing requests from other sites, not reads or partner callbacks", () => {
    expect(blocksCrossSiteWrite("POST", "denied", "/api/trpc/x", [])).toBe(true);
    expect(blocksCrossSiteWrite("DELETE", "denied", "/api/x", [])).toBe(true);
    expect(blocksCrossSiteWrite("GET", "denied", "/api/x", [])).toBe(false);
    expect(blocksCrossSiteWrite("POST", "same", "/api/x", [])).toBe(false);
    expect(blocksCrossSiteWrite("POST", "allowed", "/api/x", [])).toBe(false);
    expect(blocksCrossSiteWrite("POST", "denied", "/api/webhooks/shopee", ["/api/webhooks/"])).toBe(
      false,
    );
  });

  it("answers preflights without credentials", () => {
    const p = preflightHeaders("https://partner.vn");
    expect(p["Access-Control-Allow-Origin"]).toBe("https://partner.vn");
    expect(p["Access-Control-Allow-Headers"]).toContain("X-Tenant-ID");
    expect(p).not.toHaveProperty("Access-Control-Allow-Credentials");
    expect(p.Vary).toBe("Origin");
  });
});
