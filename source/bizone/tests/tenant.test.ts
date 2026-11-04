import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentTenantId,
  isKnownTenant,
  runWithTenant,
  tenantDatabase,
  TenantError,
} from "@/lib/tenant";
import { parsePosChannel, posChannel } from "@/lib/pos/protocol";

afterEach(() => vi.unstubAllEnvs());

describe("tenant registry", () => {
  it("maps provisioned tenants to their own database", () => {
    vi.stubEnv("TENANT_DATABASES", "tenant_demo=bizonedb, acme=bizone_acme");
    expect(tenantDatabase("tenant_demo")).toBe("bizonedb");
    expect(tenantDatabase("acme")).toBe("bizone_acme");
  });

  it("rejects tenants that are not provisioned (fail closed)", () => {
    vi.stubEnv("TENANT_DATABASES", "tenant_demo=bizonedb");
    expect(isKnownTenant("other")).toBe(false);
    expect(isKnownTenant(null)).toBe(false);
    expect(() => tenantDatabase("other")).toThrow(TenantError);
    expect(() => runWithTenant("other", () => 1)).toThrow(TenantError);
  });

  it("rejects malformed registry entries", () => {
    vi.stubEnv("TENANT_DATABASES", "acme=bizone;drop");
    expect(() => tenantDatabase("acme")).toThrow(/Invalid TENANT_DATABASES/);
  });
});

describe("tenant scope", () => {
  it("throws outside runWithTenant instead of using a shared database", () => {
    expect(() => currentTenantId()).toThrow(TenantError);
  });

  it("keeps concurrent requests in their own tenant across awaits", async () => {
    vi.stubEnv("TENANT_DATABASES", "a=db_a,b=db_b");
    const seen = await Promise.all(
      ["a", "b", "a", "b"].map((t, i) =>
        runWithTenant(t, async () => {
          await new Promise((r) => setTimeout(r, 10 - i * 2));
          return currentTenantId();
        }),
      ),
    );
    expect(seen).toEqual(["a", "b", "a", "b"]);
  });
});

describe("POS channels", () => {
  it("namespace session channels by tenant and round-trip", () => {
    const ch = posChannel("tenant_demo", 42);
    expect(ch).toBe("bizone:pos:tenant_demo:42");
    expect(parsePosChannel(ch)).toEqual({ tenantId: "tenant_demo", sessionId: 42 });
    expect(parsePosChannel("bizone:pos:42")).toBeNull();
  });
});
