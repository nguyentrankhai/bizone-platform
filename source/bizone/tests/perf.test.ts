import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis (only the commands lib/cache.ts uses)
const store = new Map<string, string>();
let redisDown = false;
const fakeRedis = {
  get: vi.fn(async (k: string) => {
    if (redisDown) throw new Error("ECONNREFUSED");
    return store.get(k) ?? null;
  }),
  set: vi.fn(async (k: string, v: string) => {
    if (redisDown) throw new Error("ECONNREFUSED");
    store.set(k, v);
    return "OK";
  }),
  pipeline: () => {
    const ops: string[] = [];
    const p = {
      incr: (k: string) => (ops.push(k), p),
      exec: async () => {
        if (redisDown) throw new Error("ECONNREFUSED");
        for (const k of ops) store.set(k, String(Number(store.get(k) ?? "0") + 1));
        return [];
      },
    };
    return p;
  },
};
vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));
let tenant = "tenant_a";
vi.mock("@/lib/tenant", () => ({ currentTenantId: () => tenant }));

const { cached, invalidate, stableKey, entryKey } = await import("@/lib/cache");
const { addSums, emptySums, mergeGroups, toTotals } =
  await import("@/server/services/report.service");

beforeEach(() => {
  store.clear();
  redisDown = false;
  tenant = "tenant_a";
});

describe("lib/cache (P6.5)", () => {
  it("serves the second call from Redis, keeps Dates", async () => {
    const load = vi.fn(async () => ({ at: new Date("2026-11-18T00:00:00Z"), n: 1 }));
    const a = await cached("products", "list:1", load);
    const b = await cached("products", "list:1", load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(b.at).toBeInstanceOf(Date);
  });

  it("invalidate() bumps the namespace version — old entries are never read again", async () => {
    let v = 1;
    const load = async () => v;
    expect(await cached("products", "k", load)).toBe(1);
    v = 2;
    expect(await cached("products", "k", load)).toBe(1); // cached
    await invalidate("products");
    expect(await cached("products", "k", load)).toBe(2);
    // another namespace / tenant is untouched
    expect(store.get("cache:tenant_a:dashboard:ver")).toBeUndefined();
  });

  it("isolates tenants", async () => {
    await cached("dashboard", "all:today", async () => "A");
    tenant = "tenant_b";
    expect(await cached("dashboard", "all:today", async () => "B")).toBe("B");
    expect(entryKey("tenant_a", "dashboard", "0", "x")).not.toBe(
      entryKey("tenant_b", "dashboard", "0", "x"),
    );
  });

  it("runs one load for concurrent misses of the same key", async () => {
    let calls = 0;
    const load = () =>
      new Promise<number>((r) => {
        calls++;
        setTimeout(() => r(42), 20);
      });
    const out = await Promise.all([1, 2, 3, 4].map(() => cached("salesHistory", "rep:x", load)));
    expect(out).toEqual([42, 42, 42, 42]);
    expect(calls).toBe(1);
  });

  it("falls back to the database when Redis is down", async () => {
    redisDown = true;
    const load = vi.fn(async () => "fresh");
    expect(await cached("products", "k", load)).toBe("fresh");
    expect(await cached("products", "k", load)).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
    await expect(invalidate("products")).resolves.toBeUndefined();
  });

  it("stableKey ignores property order and undefined", () => {
    expect(stableKey({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe(
      stableKey({ a: { c: [2, 1] }, b: 1 }),
    );
    expect(stableKey({ page: 1 })).not.toBe(stableKey({ page: 2 }));
  });
});

describe("report sums (P6.5: cached past days + live today)", () => {
  const s = (net: number, invoices: number) => ({ ...emptySums(), gross: net, net, invoices });

  it("adds every additive field", () => {
    const t = addSums(s(100, 2), { ...s(50, 1), cost: 30, qty: 3, no_cost_lines: 1 });
    expect(t).toMatchObject({ gross: 150, net: 150, invoices: 3, cost: 30, qty: 3 });
    expect(toTotals(t)).toMatchObject({ net: 150, profit: 120, avgPerInvoice: 50 });
  });

  it("merges groups of both parts by key", () => {
    const merged = new Map(
      mergeGroups(
        [
          ["2026-11-17", s(100, 2)],
          ["7", s(10, 1)],
        ],
        [
          ["2026-11-18", s(40, 1)],
          ["7", s(5, 1)],
        ],
      ),
    );
    expect(merged.get("2026-11-17")?.net).toBe(100);
    expect(merged.get("2026-11-18")?.net).toBe(40);
    expect(merged.get("7")).toMatchObject({ net: 15, invoices: 2 });
  });
});
