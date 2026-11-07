import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis with SET … NX semantics (QA-2 #41: concurrent duplicates must not both pass)
const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: async (k: string, v: string, ...args: (string | number)[]) => {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => (store.delete(k) ? 1 : 0),
  }),
}));

const {
  claimIdempotency,
  completeIdempotency,
  idempotencyKeyOf,
  releaseIdempotency,
  requestFingerprint,
} = await import("@/server/middleware/idempotency");

const fp = requestFingerprint("POST", "/api/v1/transactions", '{"amount":1000}');

describe("idempotency (QA-2 #41)", () => {
  beforeEach(() => store.clear());

  it("reads the spec header Idempotency-Key and the legacy X-Idempotency-Key", () => {
    const spec = new Request("http://x", { headers: { "Idempotency-Key": "k1" } });
    const legacy = new Request("http://x", { headers: { "X-Idempotency-Key": "k2" } });
    const none = new Request("http://x");
    expect(idempotencyKeyOf(spec)).toBe("k1");
    expect(idempotencyKeyOf(legacy)).toBe("k2");
    expect(idempotencyKeyOf(none)).toBeUndefined();
  });

  it("lets exactly one of several concurrent requests through", async () => {
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimIdempotency("txn", 1, "same-key", fp)),
    );
    expect(claims.filter((c) => c.kind === "claimed")).toHaveLength(1);
    expect(claims.filter((c) => c.kind === "in_progress")).toHaveLength(4);
  });

  it("replays the stored response after completion", async () => {
    await claimIdempotency("txn", 1, "k", fp);
    await completeIdempotency("txn", 1, "k", fp, 201, { transaction_id: 7 });
    expect(await claimIdempotency("txn", 1, "k", fp)).toEqual({
      kind: "replay",
      status: 201,
      response: { transaction_id: 7 },
    });
  });

  it("rejects the same key with a different request body", async () => {
    await claimIdempotency("txn", 1, "k", fp);
    const other = requestFingerprint("POST", "/api/v1/transactions", '{"amount":2000}');
    expect((await claimIdempotency("txn", 1, "k", other)).kind).toBe("mismatch");
  });

  it("scopes keys per merchant and frees a released claim", async () => {
    expect((await claimIdempotency("txn", 1, "k", fp)).kind).toBe("claimed");
    expect((await claimIdempotency("txn", 2, "k", fp)).kind).toBe("claimed");
    await releaseIdempotency("txn", 1, "k");
    expect((await claimIdempotency("txn", 1, "k", fp)).kind).toBe("claimed");
  });
});
