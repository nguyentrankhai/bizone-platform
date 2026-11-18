import superjson from "superjson";
import { getRedis } from "@/lib/redis";
import { currentTenantId } from "@/lib/tenant";

/**
 * P6.5 — Redis cache theo tenant, xoá bằng phiên bản.
 *
 * Khoá: `cache:{tenant}:{ns}:v{version}:{suffix}`. Xoá cả một vùng (`invalidate(ns)`) chỉ là
 * `INCR cache:{tenant}:{ns}:ver` — các khoá cũ không bao giờ được đọc nữa và tự hết TTL, nên
 * không phải `SCAN` / `KEYS` cả keyspace mỗi lần dữ liệu đổi (POS bán liên tục).
 *
 * Giá trị lưu bằng superjson: Date giữ nguyên kiểu, Decimal thành chuỗi — đúng hình dạng client
 * nhận qua tRPC. Redis lỗi → bỏ qua cache, luôn trả dữ liệu thật (cache không bao giờ làm hỏng
 * request).
 */

export const CACHE_TTL = {
  /** PLAN P2.9: số liệu dashboard cũ tối đa 30 s */
  dashboard: 20,
  /** PLAN P6.5: danh sách sản phẩm 5 phút (xoá ngay khi sản phẩm / danh mục đổi) */
  products: 300,
  /** Báo cáo của các ngày đã qua — xoá khi hoá đơn cũ bị huỷ / trả, SP đổi giá vốn / danh mục */
  salesHistory: 6 * 3600,
  /** Danh mục + chi tiết SP của website (P6.1, #133): tồn kho trên website < 30 s (SRS-OMNI-04) */
  storeCatalog: 15,
} as const;

export type CacheNamespace = keyof typeof CACHE_TTL;

const verKey = (tenant: string, ns: CacheNamespace) => `cache:${tenant}:${ns}:ver`;

/** Khoá đầy đủ của một mục (đọc phiên bản hiện tại của vùng) */
export async function cacheKey(
  ns: CacheNamespace,
  suffix: string,
  tenant: string = currentTenantId(),
): Promise<string> {
  const ver = (await getRedis().get(verKey(tenant, ns))) ?? "0";
  return entryKey(tenant, ns, ver, suffix);
}

/** Khoá của một mục khi đã biết phiên bản (thuần — dùng cho test) */
export function entryKey(tenant: string, ns: CacheNamespace, ver: string, suffix: string): string {
  return `cache:${tenant}:${ns}:v${ver}:${suffix}`;
}

/**
 * Đọc từ cache hoặc tính `load()` rồi lưu `ttl` giây. `suffix` phải chứa mọi tham số làm đổi
 * kết quả (input đã chuẩn hoá, chi nhánh…) — xem `stableKey`.
 */
export async function cached<T>(
  ns: CacheNamespace,
  suffix: string,
  load: () => Promise<T>,
  ttl: number = CACHE_TTL[ns],
): Promise<T> {
  const redis = getRedis();
  let key: string | null = null;
  try {
    key = await cacheKey(ns, suffix);
    const hit = await redis.get(key);
    if (hit !== null) return superjson.parse<T>(hit);
  } catch {
    key = null; // Redis không sẵn sàng → tính trực tiếp
  }
  if (!key) return load();
  const k = key;
  // Một lần tính cho các request đồng thời cùng khoá trong process (tránh dồn truy vấn nặng
  // khi cache vừa hết hạn / vừa bị xoá)
  const pending = inflight.get(k) as Promise<T> | undefined;
  if (pending) return pending;
  const run = (async () => {
    const value = await load();
    await redis.set(k, superjson.stringify(value), "EX", ttl).catch(() => undefined);
    return value;
  })().finally(() => inflight.delete(k));
  inflight.set(k, run);
  return run;
}

const inflight = new Map<string, Promise<unknown>>();

/** Bỏ toàn bộ vùng cache của tenant (best effort — TTL che phần còn lại nếu Redis lỗi) */
export async function invalidate(
  ns: CacheNamespace | CacheNamespace[],
  tenant: string = currentTenantId(),
): Promise<void> {
  const list = Array.isArray(ns) ? ns : [ns];
  const pipe = getRedis().pipeline();
  for (const n of list) pipe.incr(verKey(tenant, n));
  await pipe.exec().catch(() => undefined);
}

/** Chuỗi khoá ổn định cho một input (bỏ `undefined`, sắp xếp thuộc tính) */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
