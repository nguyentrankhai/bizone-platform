import { createHash } from "node:crypto";
import { getRedis, type RedisClient } from "@/lib/redis";

/**
 * Redis cache of transaction list pages (P7.4) — the admin list / merchant `GET
 * /api/v1/transactions` is polled constantly and its COUNT(*) grows with the table.
 *
 * Key = list version(s) + hash of the query: a version is bumped (`bumpTxnListVersion`) by every
 * transaction event published through `publishEvent` (created, status changed, expired,
 * refunded), so a new / changed transaction is visible at once. Writes that publish no event
 * (e.g. a regenerated payment link) show up after `TXN_LIST_CACHE_TTL_S` (default 5 s, 0 = off).
 * Two versions: "all" (lists without a merchant filter) and one per merchant (merchant-bound
 * lists are not invalidated by other merchants' traffic). Redis down → query the DB directly.
 *
 * Version keys share the hash tag `{txnlist}` (one MGET / MULTI on a Redis Cluster); entries do
 * not, so they spread across the cluster.
 */

const VERSION_PREFIX = "payhub:{txnlist}:ver";
const ENTRY_PREFIX = "payhub:txnlist";

export function txnListCacheTtl(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TXN_LIST_CACHE_TTL_S;
  if (raw === undefined || raw.trim() === "") return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 300) : 5;
}

function versionKeys(merchantId?: number): string[] {
  return merchantId === undefined
    ? [`${VERSION_PREFIX}:all`]
    : [`${VERSION_PREFIX}:all`, `${VERSION_PREFIX}:m:${merchantId}`];
}

/** Stable key part for a query object (sorted keys, undefined dropped). */
export function queryHash(query: Record<string, unknown>): string {
  const sorted = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== "")
    .sort()
    .map((k) => [k, query[k]]);
  return createHash("sha1").update(JSON.stringify(sorted)).digest("hex").slice(0, 24);
}

export function entryKey(
  versions: (string | null)[],
  merchantId: number | undefined,
  hash: string,
) {
  const v = versions.map((x) => x ?? "0").join(".");
  return `${ENTRY_PREFIX}:${merchantId === undefined ? "all" : `m${merchantId}`}:v${v}:${hash}`;
}

/**
 * Cached `load()`; `revive` turns the JSON back into the loader's shape (dates…). A list for one
 * merchant depends on that merchant's version only — "all" bumps on every event anyway.
 */
export async function cachedTxnList<T>(
  query: Record<string, unknown>,
  merchantId: number | undefined,
  load: () => Promise<T>,
  revive: (raw: T) => T,
  redis: RedisClient = getRedis(),
): Promise<T> {
  const ttl = txnListCacheTtl();
  if (ttl <= 0) return load();
  let key: string;
  try {
    const keys = versionKeys(merchantId);
    const versions =
      merchantId === undefined ? await redis.mget(keys[0]) : await redis.mget(keys[1]);
    key = entryKey(versions, merchantId, queryHash(query));
    const hit = await redis.get(key);
    if (hit) return revive(JSON.parse(hit) as T);
  } catch (e) {
    console.error(`[txn-list-cache] ${e instanceof Error ? e.message : e}`);
    return load();
  }
  const value = await load();
  redis
    .set(key, JSON.stringify(value), "EX", ttl)
    .catch((e: unknown) => console.error(`[txn-list-cache] ${e instanceof Error ? e.message : e}`));
  return value;
}

/** Invalidate list pages showing this merchant's transactions (and the unfiltered lists). */
export async function bumpTxnListVersion(
  merchantId: number | undefined,
  redis: RedisClient = getRedis(),
): Promise<void> {
  const keys =
    merchantId === undefined || !Number.isFinite(merchantId)
      ? versionKeys()
      : versionKeys(merchantId);
  const tx = redis.multi();
  for (const k of keys) tx.incr(k).expire(k, 86400);
  await tx.exec();
}

const LIST_EVENTS = /^(transaction|refund|dispute)\./;

/** Events that change what a transaction list shows. */
export function affectsTxnList(type: string): boolean {
  return LIST_EVENTS.test(type);
}
