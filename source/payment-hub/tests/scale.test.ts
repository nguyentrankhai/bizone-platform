import { describe, expect, it, vi } from "vitest";
import { clusterNodes, isClusterMode, queuePrefix, slotTag } from "@/lib/redis";
import { bfKey } from "@/lib/rate-limit";
import {
  archiveSettings,
  expiredPartitions,
  monthKey,
  monthsAgo,
  monthsToCreate,
  partitionBound,
  reorganizeSql,
  type PartitionInfo,
} from "@/lib/archive";
import {
  affectsTxnList,
  bumpTxnListVersion,
  cachedTxnList,
  entryKey,
  queryHash,
} from "@/lib/txn-list-cache";
import { parseWorkerRoles, workerConcurrency, WORKER_ROLES } from "@/services/queue/roles";
import { taskSchedules } from "@/services/queue/maintenance";

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
const { isTxnCodeCollision } = await import("@/server/services/transaction.service");

// ─── Redis cluster config ─────────────────────────────────────────────────────

/** Cluster hash slot of a key: CRC16 of the hash tag (or whole key) mod 16384. */
function slot(key: string): number {
  const open = key.indexOf("{");
  if (open >= 0) {
    const close = key.indexOf("}", open + 1);
    if (close > open + 1) key = key.slice(open + 1, close);
  }
  let crc = 0;
  for (const b of Buffer.from(key)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc % 16384;
}

describe("Redis cluster configuration (P7.4)", () => {
  it("parses REDIS_CLUSTER_NODES", () => {
    expect(clusterNodes({})).toBeNull();
    expect(clusterNodes({ REDIS_CLUSTER_NODES: " " })).toBeNull();
    expect(
      clusterNodes({ REDIS_CLUSTER_NODES: "10.0.0.1:7000, redis://10.0.0.2:7001,[::1]:7002" }),
    ).toEqual([
      { host: "10.0.0.1", port: 7000 },
      { host: "10.0.0.2", port: 7001 },
      { host: "::1", port: 7002 },
    ]);
    expect(() => clusterNodes({ REDIS_CLUSTER_NODES: "nohost" })).toThrow(/host:port/);
    expect(isClusterMode({ REDIS_CLUSTER_NODES: "a:1" })).toBe(true);
  });

  it("BullMQ prefix: bull on a single server, hash-tagged on a cluster, overridable", () => {
    expect(queuePrefix({})).toBe("bull");
    expect(queuePrefix({ REDIS_CLUSTER_NODES: "a:1" })).toBe("{payhub}");
    expect(queuePrefix({ REDIS_CLUSTER_NODES: "a:1", QUEUE_PREFIX: "{ph2}" })).toBe("{ph2}");
  });

  it("keys used together share one slot (MULTI / MGET stay valid on a cluster)", () => {
    expect(slot("123456789")).toBe(12739); // CRC16-XMODEM reference value
    expect(slot(bfKey("payhub:apikey:ip:1.2.3.4", "fail"))).toBe(
      slot(bfKey("payhub:apikey:ip:1.2.3.4", "lock")),
    );
    // circuit breaker keys of different partners (routeEngine.ts)
    expect(slot("payhub:route:{cb}:fail:1")).toBe(slot("payhub:route:{cb}:open:42"));
    // list-cache versions ("all" + one merchant bumped in one MULTI)
    expect(slot("payhub:{txnlist}:ver:all")).toBe(slot("payhub:{txnlist}:ver:m:7"));
    // every key of a BullMQ queue under the cluster prefix
    expect(slot("{payhub}:webhook-delivery:wait")).toBe(slot("{payhub}:payhub-maintenance:id"));
    expect(slotTag("x")).toBe("{x}");
  });
});

// ─── Archive / partitions ─────────────────────────────────────────────────────

const PARTS: PartitionInfo[] = [
  { name: "p_old", description: "'2025-01-01 00:00:00'" },
  { name: "p202501", description: "'2025-02-01 00:00:00'" },
  { name: "p_max", description: "MAXVALUE" },
];

describe("transaction archive rules (P7.4)", () => {
  it("cutoff = first day of the month N months back (UTC)", () => {
    expect(monthsAgo(new Date("2027-03-10T12:00:00Z"), 24).toISOString()).toBe(
      "2025-03-01T00:00:00.000Z",
    );
    expect(monthsAgo(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2025-12-01T00:00:00.000Z",
    );
    expect(monthKey(new Date("2024-12-31T23:59:59Z"))).toBe("2024-12");
    expect(partitionBound("2024-12")).toBe("2025-01-01 00:00:00");
  });

  it("creates the missing month partitions in order, filling gaps", () => {
    expect(monthsToCreate(PARTS, ["2024-06"])).toEqual([]); // inside p_old
    expect(monthsToCreate(PARTS, ["2025-01"])).toEqual([]); // has its partition
    expect(monthsToCreate(PARTS, ["2025-04", "2025-02"])).toEqual([
      "2025-02",
      "2025-03",
      "2025-04",
    ]);
    expect(reorganizeSql("t", ["2025-02"])).toBe(
      "ALTER TABLE `t` REORGANIZE PARTITION `p_max` INTO (PARTITION `p202502` VALUES LESS THAN ('2025-03-01 00:00:00'), PARTITION `p_max` VALUES LESS THAN (MAXVALUE))",
    );
    expect(reorganizeSql("t", [])).toBeNull();
  });

  it("retention drops whole months only once every row is older than the cutoff", () => {
    const now = new Date("2027-03-10T00:00:00Z");
    expect(expiredPartitions(PARTS, now, 0)).toEqual([]);
    expect(expiredPartitions(PARTS, now, 26)).toEqual([]); // cutoff 2025-01: p202501 still needed
    expect(expiredPartitions(PARTS, now, 25)).toEqual(["p202501"]); // cutoff 2025-02
  });

  it("validates the settings", () => {
    expect(archiveSettings({})).toMatchObject({ months: 24, retentionMonths: 0, batchSize: 500 });
    expect(archiveSettings({ TXN_ARCHIVE_MONTHS: "0" }).months).toBe(0);
    expect(() => archiveSettings({ TXN_ARCHIVE_MONTHS: "6" })).toThrow(/≥ 13/);
    expect(() =>
      archiveSettings({ TXN_ARCHIVE_MONTHS: "24", TXN_ARCHIVE_RETENTION_MONTHS: "24" }),
    ).toThrow(/greater/);
    expect(() => archiveSettings({ TXN_ARCHIVE_BATCH: "abc" })).toThrow();
  });
});

// ─── Transaction list cache ───────────────────────────────────────────────────

function fakeRedis(fail = false) {
  const store = new Map<string, string>();
  const boom = () => {
    if (fail) throw new Error("redis down");
  };
  return {
    store,
    mget: async (...keys: string[]) => (boom(), keys.map((k) => store.get(k) ?? null)),
    get: async (k: string) => (boom(), store.get(k) ?? null),
    set: async (k: string, v: string) => (boom(), store.set(k, v), "OK"),
    multi() {
      const ops: (() => void)[] = [];
      const chain = {
        incr: (k: string) => (
          ops.push(() => store.set(k, String(Number(store.get(k) ?? 0) + 1))),
          chain
        ),
        expire: () => chain,
        exec: async () => (boom(), ops.forEach((f) => f()), []),
      };
      return chain;
    },
  };
}

describe("transaction list cache (P7.4)", () => {
  it("hash ignores key order and empty values", () => {
    expect(queryHash({ a: 1, b: "x", c: undefined })).toBe(queryHash({ b: "x", a: 1, d: "" }));
    expect(queryHash({ a: 1 })).not.toBe(queryHash({ a: 2 }));
    expect(entryKey(["3"], 5, "h")).toBe("payhub:txnlist:m5:v3:h");
    expect(entryKey([null], undefined, "h")).toBe("payhub:txnlist:all:v0:h");
  });

  it("serves the cached page until a transaction event bumps the version", async () => {
    const redis = fakeRedis();
    let loads = 0;
    const load = async () => ({ n: ++loads, at: new Date("2026-11-21T00:00:00Z") });
    const revive = (r: { n: number; at: Date }) => ({ ...r, at: new Date(r.at) });
    const q = { page: 1, status: "Success" };
    const r = redis as never;
    const first = await cachedTxnList(q, 7, load, revive, r);
    const again = await cachedTxnList(q, 7, load, revive, r);
    expect(first.n).toBe(1);
    expect(again.n).toBe(1);
    expect(again.at).toBeInstanceOf(Date);
    // another merchant's event does not touch merchant 7's lists…
    await bumpTxnListVersion(8, r);
    expect((await cachedTxnList(q, 7, load, revive, r)).n).toBe(1);
    // …but invalidates the unfiltered (admin) lists
    await cachedTxnList(q, undefined, load, revive, r); // n = 2
    await bumpTxnListVersion(8, r);
    expect((await cachedTxnList(q, undefined, load, revive, r)).n).toBe(3);
    await bumpTxnListVersion(7, r);
    expect((await cachedTxnList(q, 7, load, revive, r)).n).toBe(4);
  });

  it("Redis down → straight from the DB", async () => {
    let loads = 0;
    const v = await cachedTxnList(
      {},
      1,
      async () => ++loads,
      (x) => x,
      fakeRedis(true) as never,
    );
    expect(v).toBe(1);
  });

  it("only transaction / refund / dispute events invalidate", () => {
    expect(affectsTxnList("transaction.status_changed")).toBe(true);
    expect(affectsTxnList("transaction.refunded")).toBe(true);
    expect(affectsTxnList("dispute.updated")).toBe(true);
    expect(affectsTxnList("notification.created")).toBe(false);
    expect(affectsTxnList("recon.completed")).toBe(false);
  });
});

// ─── Workers ──────────────────────────────────────────────────────────────────

describe("worker roles + periodic jobs (P7.4)", () => {
  it("WORKER_QUEUES selects the queues of an instance", () => {
    expect([...parseWorkerRoles(undefined)]).toEqual([...WORKER_ROLES]);
    expect([...parseWorkerRoles("all")]).toEqual([...WORKER_ROLES]);
    expect([...parseWorkerRoles(" Webhook , maintenance")]).toEqual(["webhook", "maintenance"]);
    expect(() => parseWorkerRoles("webhook,email")).toThrow(/unknown queue "email"/);
    expect(() => parseWorkerRoles(",")).toThrow(/no queue/);
  });

  it("concurrency per queue from env, defaults otherwise", () => {
    expect(workerConcurrency("webhook", {})).toBe(20);
    expect(workerConcurrency("webhook", { WORKER_CONCURRENCY_WEBHOOK: "50" })).toBe(50);
    expect(workerConcurrency("recon", { WORKER_CONCURRENCY_RECON: "0" })).toBe(1);
    expect(workerConcurrency("notification", { WORKER_CONCURRENCY_NOTIFICATION: "x" })).toBe(4);
  });

  it("every periodic task is one scheduler with a lock shorter than its period", () => {
    const s = taskSchedules();
    expect(s.map((t) => t.task)).toEqual([
      "webhook-outbox",
      "expiry",
      "connector-health",
      "retention",
      "archive",
    ]);
    for (const t of s) expect(Boolean(t.every) !== Boolean(t.pattern)).toBe(true);
    expect(s.find((t) => t.task === "connector-health")!.lockMs).toBeLessThan(300_000);
  });
});

// ─── txn_code collisions ──────────────────────────────────────────────────────

describe("txn_code collision retry (P7.4)", () => {
  // Shapes of the Prisma 7 + MariaDB adapter errors seen on the load-test database
  const err = (index: string) => ({
    code: "P2002",
    meta: {
      modelName: "Transaction",
      driverAdapterError: {
        cause: { kind: "UniqueConstraintViolation", constraint: { index } },
      },
    },
  });

  it("retries a txn_code clash, never a merchant_txn_id duplicate", () => {
    expect(isTxnCodeCollision(err("transactions_txn_code_key"))).toBe(true);
    expect(isTxnCodeCollision(err("uq_txn_merchant_txn"))).toBe(false);
    expect(isTxnCodeCollision({ code: "P2003" })).toBe(false);
    expect(isTxnCodeCollision(new Error("x"))).toBe(false);
  });
});
