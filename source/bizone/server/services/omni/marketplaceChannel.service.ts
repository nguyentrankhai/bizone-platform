import { parseMarketplaceConfig } from "@/lib/omni/marketplace-config";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { currentTenantId, runWithTenant, tenantRegistry } from "@/lib/tenant";
import {
  MARKETPLACES,
  MARKETPLACE_FEATURES,
  MARKETPLACE_NAME,
  META_SOURCES,
  PLATFORM_ENV,
  type MarketplaceCode,
  type MarketplaceConfig,
} from "@/lib/omni/marketplace";
import { decryptToken, encryptToken, tokenKeyConfigured } from "@/lib/omni/crypto";
import { connectorFor } from "./marketplace/registry";
import {
  MarketplaceError,
  type MarketCategory,
  type ShopContext,
  type ShopTokens,
} from "./marketplace/types";
import { logSync, reportSyncFailure } from "./websiteChannel.service";

/**
 * Marketplace shops (P6.2, TikTok Shop / Facebook catalog P6.3): one `channel_connections` row
 * per tenant and platform.
 *
 * Connecting = OAuth: the admin gets the platform's authorize URL with a one-time `state`
 * (Redis, 10 min, carries tenant + user), the platform redirects the browser to
 * `/api/omni/oauth/{code}/callback`, which trades the code for tokens. Tokens are stored
 * AES-GCM encrypted; they are refreshed before expiry under a Redis lock (Shopee refresh tokens
 * are single use). A token the platform rejects for good marks the shop "needs reconnecting"
 * and raises `sync_failed`.
 */

export type ChannelRow = NonNullable<Awaited<ReturnType<typeof findChannel>>>;

export async function findChannel(code: MarketplaceCode) {
  return getPrisma().channelConnection.findFirst({
    where: { channelCode: code },
    orderBy: { id: "asc" },
  });
}

export async function channelById(id: number) {
  return getPrisma().channelConnection.findUnique({ where: { id } });
}

export function isConnected(ch: {
  accessToken: string | null;
  refreshToken: string | null;
  shopId: string | null;
}) {
  return !!(ch.accessToken && ch.refreshToken && ch.shopId);
}

export type ChannelState = "not_configured" | "disconnected" | "connected" | "paused" | "reconnect";

export function channelState(
  ch: Pick<
    ChannelRow,
    "accessToken" | "refreshToken" | "shopId" | "isActive" | "lastError" | "refreshExpiresAt"
  > | null,
): ChannelState {
  if (!ch) return "disconnected";
  if (!isConnected(ch)) return "disconnected";
  if (ch.refreshExpiresAt && ch.refreshExpiresAt.getTime() < Date.now()) return "reconnect";
  if (ch.lastError?.startsWith("AUTH:")) return "reconnect";
  return ch.isActive ? "connected" : "paused";
}

/** Settings of a channel row, or a 409 telling the admin to fill them in */
export function requireConfig(
  ch: { config: string | null },
  code: MarketplaceCode,
): MarketplaceConfig {
  const cfg = parseMarketplaceConfig(ch.config);
  if (!cfg)
    throw bizoneError(
      "CONFLICT",
      `Chưa cài đặt kênh ${MARKETPLACE_NAME[code]} (chi nhánh nhận đơn)`,
    );
  return cfg;
}

// ─── Admin view ──────────────────────────────────────────────────────────────

export async function getMarketplaceChannel(code: MarketplaceCode) {
  const prisma = getPrisma();
  const connector = connectorFor(code);
  const [ch, branches, categories] = await Promise.all([
    findChannel(code),
    prisma.branch.findMany({
      where: { status: "active" },
      select: { id: true, name: true, isDefault: true },
      orderBy: { id: "asc" },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);
  const base = {
    code,
    name: MARKETPLACE_NAME[code],
    features: MARKETPLACE_FEATURES[code],
    platformEnv: PLATFORM_ENV[code],
    platformConfigured: connector.configured() && tokenKeyConfigured(),
    branches,
    categories,
  };
  if (!ch)
    return { ...base, exists: false as const, state: "disconnected" as ChannelState, config: null };

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [listingGroups, orders30d, failed24h] = await Promise.all([
    prisma.channelProductMapping.groupBy({
      by: ["syncStatus", "isActive"],
      where: { channelId: ch.id },
      _count: { _all: true },
    }),
    // Facebook / Instagram sell through the website: count website orders from Meta links
    prisma.order.count({
      where: MARKETPLACE_FEATURES[code].orders
        ? { channel: code, createdAt: { gte: since } }
        : { channel: "website", source: { in: [...META_SOURCES] }, createdAt: { gte: since } },
    }),
    prisma.syncLog.count({
      where: {
        channelId: ch.id,
        status: "failed",
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    }),
  ]);
  const listings = { synced: 0, pending: 0, error: 0, paused: 0 };
  for (const g of listingGroups) {
    if (!g.isActive) listings.paused += g._count._all;
    else listings[g.syncStatus] += g._count._all;
  }
  return {
    ...base,
    exists: true as const,
    id: ch.id,
    state: channelState(ch),
    shopId: ch.shopId,
    shopName: ch.channelName,
    isActive: ch.isActive,
    config: parseMarketplaceConfig(ch.config),
    tokenExpiresAt: ch.tokenExpiresAt?.toISOString() ?? null,
    refreshExpiresAt: ch.refreshExpiresAt?.toISOString() ?? null,
    lastSyncAt: ch.lastSyncAt?.toISOString() ?? null,
    lastOrderSyncAt: ch.lastOrderSyncAt?.toISOString() ?? null,
    lastError: ch.lastError?.replace(/^AUTH:\s*/, "") ?? null,
    listings,
    orders30d,
    failed24h,
  };
}

async function assertBranch(branchId: number) {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.status !== "active")
    throw bizoneError("VALIDATION_ERROR", "Chi nhánh nhận đơn không tồn tại hoặc đã ngừng");
  const wh = await prisma.warehouse.findFirst({
    where: { branchId, isActive: true },
    select: { id: true },
  });
  if (!wh)
    throw bizoneError("VALIDATION_ERROR", `Chi nhánh "${branch.name}" chưa có kho hoạt động`);
}

/** Create / update the channel settings (connecting is separate) */
export async function saveMarketplaceConfig(code: MarketplaceCode, cfg: MarketplaceConfig) {
  await assertBranch(cfg.branchId);
  const prisma = getPrisma();
  const ch = await findChannel(code);
  if (ch) {
    await prisma.channelConnection.update({
      where: { id: ch.id },
      data: { config: JSON.stringify(cfg) },
    });
    // Prices / stock may change with the settings → next stock sync re-checks everything
    await prisma.channelProductMapping.updateMany({
      where: { channelId: ch.id },
      data: { channelPrice: null },
    });
    return { id: ch.id, created: false };
  }
  const created = await prisma.channelConnection.create({
    data: {
      channelCode: code,
      channelName: MARKETPLACE_NAME[code],
      isActive: true,
      config: JSON.stringify(cfg),
    },
  });
  return { id: created.id, created: true };
}

export async function setMarketplaceActive(code: MarketplaceCode, isActive: boolean) {
  const ch = await findChannel(code);
  if (!ch) throw bizoneError("NOT_FOUND", `Chưa kết nối ${MARKETPLACE_NAME[code]}`);
  await getPrisma().channelConnection.update({ where: { id: ch.id }, data: { isActive } });
  return { isActive };
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

const STATE_TTL = 600;
const stateKey = (state: string) => `omni:oauth:${state}`;
const sha256 = (v: string) => createHash("sha256").update(v).digest();

/**
 * QA-5 #160: the `state` alone would let anyone who gets the authorize link (sent on to another
 * shop's owner…) attach their shop to this tenant. The admin's browser also keeps a one-time
 * binding cookie (set by the "Kết nối" button, path = the callback); the callback must present it.
 */
export const OAUTH_BINDING_COOKIE = (code: string) => `bz_oauth_${code}`;

export function callbackUrl(code: MarketplaceCode) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/omni/oauth/${code}/callback`;
}

/** Authorize URL for the admin's browser (settings must be saved first) */
export async function startConnect(code: MarketplaceCode, userId: number | null) {
  const connector = connectorFor(code);
  if (!connector.configured())
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      `BizOne chưa có thông tin ứng dụng ${connector.name} (${PLATFORM_ENV[code]})`,
    );
  if (!tokenKeyConfigured())
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      "Chưa cấu hình khoá mã hoá (DATA_ENCRYPTION_KEY / OMNI_TOKEN_KEY)",
    );
  const ch = await findChannel(code);
  if (!ch || !parseMarketplaceConfig(ch.config))
    throw bizoneError("CONFLICT", "Lưu cài đặt kênh (chi nhánh nhận đơn) trước khi kết nối");
  const state = randomBytes(24).toString("base64url");
  const binding = randomBytes(24).toString("base64url");
  await getRedis().set(
    stateKey(state),
    JSON.stringify({
      tenantId: currentTenantId(),
      code,
      userId,
      binding: sha256(binding).toString("base64url"),
    }),
    "EX",
    STATE_TTL,
  );
  return {
    url: connector.authorizeUrl(callbackUrl(code), state),
    binding: { cookie: OAUTH_BINDING_COOKIE(code), value: binding, maxAge: STATE_TTL },
  };
}

/** Which tenant owns this shop (push notifications carry only the shop id) */
export async function findShopTenant(
  code: MarketplaceCode,
  shopId: string,
): Promise<{ tenantId: string; channelId: number } | null> {
  const redis = getRedis();
  const cacheKey = `omni:shop:${code}:${shopId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    const [tenantId, id] = cached.split("|");
    const still = await runWithTenant(tenantId, () =>
      getPrisma().channelConnection.findFirst({
        where: { id: Number(id), channelCode: code, shopId },
      }),
    ).catch(() => null);
    if (still) return { tenantId, channelId: still.id };
  }
  for (const tenantId of tenantRegistry().keys()) {
    const ch = await runWithTenant(tenantId, () =>
      getPrisma().channelConnection.findFirst({
        where: { channelCode: code, shopId },
        select: { id: true },
      }),
    ).catch(() => null);
    if (ch) {
      await redis.set(cacheKey, `${tenantId}|${ch.id}`, "EX", 3600).catch(() => undefined);
      return { tenantId, channelId: ch.id };
    }
  }
  return null;
}

/**
 * OAuth callback (route handler, outside any tenant scope): `state` → tenant, code → tokens.
 * Returns where to send the browser back to.
 */
export async function finishConnect(
  code: MarketplaceCode,
  query: URLSearchParams,
  /** value of the binding cookie the browser sent back (#160) */
  binding: string | null,
) {
  const state = query.get("state") ?? "";
  const raw = state ? await getRedis().getdel(stateKey(state)) : null;
  if (!raw)
    throw new MarketplaceError(
      "invalid",
      "Phiên kết nối đã hết hạn hoặc không hợp lệ — bấm Kết nối lại",
    );
  const saved = JSON.parse(raw) as {
    tenantId: string;
    code: string;
    userId: number | null;
    binding?: string;
  };
  if (saved.code !== code) throw new MarketplaceError("invalid", "Phiên kết nối không khớp kênh");
  const expected = Buffer.from(saved.binding ?? "", "base64url");
  const got = binding ? sha256(binding) : Buffer.alloc(0);
  if (expected.length === 0 || got.length !== expected.length || !timingSafeEqual(got, expected))
    throw new MarketplaceError(
      "invalid",
      "Phải hoàn tất uỷ quyền trên cùng trình duyệt đã bấm Kết nối — bấm Kết nối lại",
    );
  if (query.get("error"))
    throw new MarketplaceError(
      "invalid",
      `Chủ shop từ chối / huỷ uỷ quyền (${query.get("error")})`,
    );
  const connector = connectorFor(code);
  if (!connector.configured())
    throw new MarketplaceError("invalid", `BizOne chưa có thông tin ứng dụng ${connector.name}`);
  const tokens = await connector.exchangeCode(query, callbackUrl(code));
  const owner = await findShopTenant(code, tokens.shopId);
  return runWithTenant(saved.tenantId, async () => {
    const ch = await findChannel(code);
    if (!ch) throw new MarketplaceError("invalid", "Kênh chưa được cài đặt");
    if (owner && (owner.tenantId !== saved.tenantId || owner.channelId !== ch.id))
      throw new MarketplaceError(
        "invalid",
        `Shop ${tokens.shopId} đã được kết nối với cửa hàng BizOne khác`,
      );
    const firstTime = ch.shopId !== tokens.shopId;
    await saveTokens(ch.id, tokens, {
      connectedBy: saved.userId ?? ch.connectedBy,
      isActive: true,
      ...(firstTime || !ch.lastOrderSyncAt
        ? { lastOrderSyncAt: new Date(Date.now() - 86_400_000) } // first import: last 24 h
        : {}),
    });
    await getRedis()
      .set(`omni:shop:${code}:${tokens.shopId}`, `${saved.tenantId}|${ch.id}`, "EX", 3600)
      .catch(() => undefined);
    await logSync({
      channelId: ch.id,
      syncType: "auth",
      direction: "pull",
      status: "success",
      message: `Kết nối shop ${tokens.shopName ?? tokens.shopId} (${MARKETPLACE_NAME[code]})`,
      details: { shopId: tokens.shopId, expiresAt: tokens.expiresAt.toISOString() },
    });
    return { tenantId: saved.tenantId, channelId: ch.id };
  });
}

async function saveTokens(
  channelId: number,
  t: ShopTokens,
  extra: { connectedBy?: number | null; isActive?: boolean; lastOrderSyncAt?: Date } = {},
) {
  await getPrisma().channelConnection.update({
    where: { id: channelId },
    data: {
      accessToken: encryptToken(t.accessToken),
      refreshToken: encryptToken(t.refreshToken),
      tokenExpiresAt: t.expiresAt,
      refreshExpiresAt: t.refreshExpiresAt,
      shopId: t.shopId,
      ...(t.shopRef !== undefined ? { shopRef: t.shopRef } : {}),
      ...(t.shopName ? { channelName: t.shopName.slice(0, 255) } : {}),
      lastError: null,
      ...extra,
    },
  });
}

/** Forget the tokens (listings + orders stay; reconnecting the same shop resumes) */
export async function disconnectMarketplace(code: MarketplaceCode) {
  const ch = await findChannel(code);
  if (!ch) throw bizoneError("NOT_FOUND", `Chưa kết nối ${MARKETPLACE_NAME[code]}`);
  await getPrisma().channelConnection.update({
    where: { id: ch.id },
    data: {
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      refreshExpiresAt: null,
      lastError: null,
    },
  });
  if (ch.shopId)
    await getRedis()
      .del(`omni:shop:${code}:${ch.shopId}`)
      .catch(() => undefined);
  await logSync({
    channelId: ch.id,
    syncType: "auth",
    direction: "push",
    status: "success",
    message: `Ngắt kết nối ${MARKETPLACE_NAME[code]}`,
  });
  return { ok: true };
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

const REFRESH_BEFORE_MS = 5 * 60_000;

async function markAuthProblem(ch: ChannelRow, message: string) {
  const code = ch.channelCode as MarketplaceCode;
  await getPrisma().channelConnection.update({
    where: { id: ch.id },
    data: { lastError: `AUTH: ${message}` },
  });
  await reportSyncFailure({
    channelId: ch.id,
    channelName: MARKETPLACE_NAME[code],
    syncType: "auth",
    direction: "pull",
    message: `${MARKETPLACE_NAME[code]}: token hết hạn hoặc bị thu hồi — kết nối lại shop`,
    details: { error: message },
    link: `/omni/${code}`,
    dedupeKey: `omni-auth:${ch.id}:${new Date().toISOString().slice(0, 10)}`,
  });
}

/** Lock of one channel's token refresh: longer than a platform call (20 s timeout) + saving */
const REFRESH_LOCK_MS = 60_000;
const REFRESH_WAIT_MS = 45_000;
/** Delete the lock only if it is still ours (it may have expired and been taken by another job) */
const RELEASE_LOCK = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Refresh the tokens of a channel (single flight per channel, across processes).
 *
 * QA-5 #154: Shopee's refresh token works once, so two refreshes at the same time cost the shop
 * its connection. Only the holder of the Redis lock refreshes; a caller that can't get it waits
 * for the holder and uses its tokens — it never refreshes without the lock, and the lock is
 * released only by its owner.
 */
export async function refreshTokens(
  channelId: number,
  minRemainingMs = REFRESH_BEFORE_MS,
): Promise<ChannelRow> {
  const redis = getRedis();
  const lockKey = `omni:refresh:${currentTenantId()}:${channelId}`;
  const owner = randomUUID();
  const fresh = (ch: ChannelRow | null) =>
    !!ch?.tokenExpiresAt && ch.tokenExpiresAt.getTime() - Date.now() > minRemainingMs;

  const deadline = Date.now() + REFRESH_WAIT_MS;
  for (;;) {
    if (await redis.set(lockKey, owner, "PX", REFRESH_LOCK_MS, "NX")) break;
    await new Promise((r) => setTimeout(r, 500));
    // the holder may have finished: its tokens are good enough
    const ch = await channelById(channelId);
    if (ch && isConnected(ch) && fresh(ch)) return ch;
    if (Date.now() > deadline)
      throw new MarketplaceError("network", "Đang làm mới token của shop, thử lại sau");
  }
  try {
    const ch = await channelById(channelId);
    if (!ch || !isConnected(ch)) throw new MarketplaceError("auth", "Shop chưa kết nối");
    // Someone else refreshed while we waited
    if (fresh(ch)) return ch;
    const refreshToken = decryptToken(ch.refreshToken);
    if (!refreshToken)
      throw new MarketplaceError("auth", "Không đọc được refresh token (OMNI_TOKEN_KEY đã đổi?)");
    try {
      const t = await connectorFor(ch.channelCode as MarketplaceCode).refresh({
        refreshToken,
        shopId: ch.shopId!,
        shopRef: ch.shopRef,
      });
      await saveTokens(ch.id, { ...t, shopId: ch.shopId!, shopName: null });
    } catch (e) {
      if (e instanceof MarketplaceError && (e.kind === "auth" || e.kind === "invalid"))
        await markAuthProblem(ch, e.message);
      throw e;
    }
    return (await channelById(channelId))!;
  } finally {
    await redis.eval(RELEASE_LOCK, 1, lockKey, owner).catch(() => undefined);
  }
}

async function contextOf(ch: ChannelRow): Promise<ShopContext> {
  let row = ch;
  if (!row.tokenExpiresAt || row.tokenExpiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS)
    row = await refreshTokens(row.id);
  const accessToken = decryptToken(row.accessToken);
  if (!accessToken || !row.shopId) throw new MarketplaceError("auth", "Shop chưa kết nối");
  return { accessToken, shopId: row.shopId, shopRef: row.shopRef };
}

/**
 * Run a platform call for a connected shop: fresh token, one refresh + retry when the platform
 * rejects it, then "needs reconnecting".
 */
export async function withShop<T>(
  ch: ChannelRow,
  fn: (ctx: ShopContext) => Promise<T>,
): Promise<T> {
  if (channelState(ch) === "disconnected") throw new MarketplaceError("auth", "Shop chưa kết nối");
  if (channelState(ch) === "reconnect") throw new MarketplaceError("auth", "Shop cần kết nối lại");
  const ctx = await contextOf(ch);
  try {
    return await fn(ctx);
  } catch (e) {
    if (!(e instanceof MarketplaceError) || e.kind !== "auth") throw e;
    let fresh: ChannelRow;
    try {
      await getPrisma().channelConnection.update({
        where: { id: ch.id },
        data: { tokenExpiresAt: new Date(0) },
      });
      fresh = await refreshTokens(ch.id);
    } catch {
      throw e;
    }
    try {
      return await fn(await contextOf(fresh));
    } catch (again) {
      if (again instanceof MarketplaceError && again.kind === "auth")
        await markAuthProblem(fresh, again.message);
      throw again;
    }
  }
}

/** Scheduler: refresh tokens expiring within the hour (every tenant) */
export async function refreshExpiringTokens() {
  const soon = new Date(Date.now() + 60 * 60_000);
  const rows = await getPrisma().channelConnection.findMany({
    where: {
      channelCode: { in: [...MARKETPLACES] },
      accessToken: { not: null },
      tokenExpiresAt: { lt: soon },
    },
  });
  let refreshed = 0;
  for (const ch of rows) {
    if (channelState(ch) === "reconnect") continue;
    try {
      await refreshTokens(ch.id, 60 * 60_000);
      refreshed++;
    } catch (e) {
      console.error(
        `[omni] refresh ${ch.channelCode}#${ch.id} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { refreshed, due: rows.length };
}

// ─── Categories ──────────────────────────────────────────────────────────────

/** Marketplace category list (cached 24 h per tenant + channel) */
export async function marketplaceCategories(
  code: MarketplaceCode,
  refresh = false,
): Promise<MarketCategory[]> {
  const ch = await findChannel(code);
  if (!ch || !isConnected(ch))
    throw bizoneError("CONFLICT", `Kết nối ${MARKETPLACE_NAME[code]} trước`);
  const key = `omni:cats:${currentTenantId()}:${code}`;
  const redis = getRedis();
  if (!refresh) {
    const cached = await redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as MarketCategory[];
  }
  try {
    const list = await withShop(ch, (ctx) => connectorFor(code).categories(ctx));
    await redis.set(key, JSON.stringify(list), "EX", 86_400).catch(() => undefined);
    return list;
  } catch (e) {
    throw asBizError(e);
  }
}

/** Platform error → tRPC error the admin screen can show */
export function asBizError(e: unknown) {
  if (e instanceof MarketplaceError) {
    if (e.kind === "auth") return bizoneError("CONFLICT", `${e.message} — kết nối lại shop`);
    if (e.kind === "invalid") return bizoneError("VALIDATION_ERROR", e.message);
    return bizoneError("SERVICE_UNAVAILABLE", e.message);
  }
  return e;
}
