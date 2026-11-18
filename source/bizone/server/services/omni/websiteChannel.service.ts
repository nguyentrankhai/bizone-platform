import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import { parseWebsiteConfig, WEBSITE_CHANNEL, type WebsiteConfig } from "@/lib/omni/website";
import { maskStoreKey, newStoreKey, sha256 } from "@/lib/omni/secrets";
import { notify } from "@/server/services/notification.service";

/**
 * Website channel (P6.1): one `channel_connections` row per tenant with channel_code "website".
 * `access_token` = SHA-256 of the store key (the key itself is shown once), `config` = JSON
 * settings (`WebsiteConfig`). Sync events of the channel go to `sync_logs`.
 */

export async function websiteChannel() {
  return getPrisma().channelConnection.findFirst({
    where: { channelCode: WEBSITE_CHANNEL },
    orderBy: { id: "asc" },
  });
}

/** Admin view: settings, status, masked key, last sync, recent order count */
export async function getWebsiteChannel() {
  const prisma = getPrisma();
  const ch = await websiteChannel();
  const branches = await prisma.branch.findMany({
    where: { status: "active" },
    select: { id: true, name: true, isDefault: true },
    orderBy: { id: "asc" },
  });
  if (!ch) return { connected: false as const, branches };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [orders30d, failed24h] = await Promise.all([
    prisma.order.count({ where: { channel: WEBSITE_CHANNEL, createdAt: { gte: since } } }),
    prisma.syncLog.count({
      where: {
        channelId: ch.id,
        status: "failed",
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    }),
  ]);
  return {
    connected: true as const,
    id: ch.id,
    name: ch.channelName,
    isActive: ch.isActive,
    hasKey: !!ch.accessToken,
    keyHint: maskStoreKey(currentTenantId()),
    config: parseWebsiteConfig(ch.config),
    lastSyncAt: ch.lastSyncAt?.toISOString() ?? null,
    orders30d,
    failed24h,
    branches,
  };
}

async function assertSettings(cfg: WebsiteConfig) {
  const branch = await getPrisma().branch.findUnique({ where: { id: cfg.branchId } });
  if (!branch || branch.status !== "active")
    throw bizoneError("VALIDATION_ERROR", "Chi nhánh nhận đơn không tồn tại hoặc đã ngừng");
  const wh = await getPrisma().warehouse.findFirst({
    where: { branchId: cfg.branchId, isActive: true },
    select: { id: true },
  });
  if (!wh)
    throw bizoneError(
      "VALIDATION_ERROR",
      `Chi nhánh "${branch.name}" chưa có kho hoạt động để bán online`,
    );
}

/** Create or update the website channel settings */
export async function saveWebsiteChannel(cfg: WebsiteConfig) {
  await assertSettings(cfg);
  const prisma = getPrisma();
  const ch = await websiteChannel();
  const data = { channelName: cfg.storeName, shopId: cfg.slug, config: JSON.stringify(cfg) };
  if (ch) {
    await prisma.channelConnection.update({ where: { id: ch.id }, data });
    return { id: ch.id, created: false };
  }
  const created = await prisma.channelConnection.create({
    data: { ...data, channelCode: WEBSITE_CHANNEL, isActive: true },
  });
  return { id: created.id, created: true };
}

/** New store key (the old one stops working at once) — returned once, only its hash is kept */
export async function rotateStoreKey() {
  const ch = await websiteChannel();
  if (!ch) throw bizoneError("NOT_FOUND", "Chưa cấu hình kênh website");
  const key = newStoreKey(currentTenantId());
  await getPrisma().channelConnection.update({
    where: { id: ch.id },
    data: { accessToken: sha256(key) },
  });
  return { key };
}

export async function setWebsiteActive(isActive: boolean) {
  const ch = await websiteChannel();
  if (!ch) throw bizoneError("NOT_FOUND", "Chưa cấu hình kênh website");
  await getPrisma().channelConnection.update({ where: { id: ch.id }, data: { isActive } });
  return { isActive };
}

/** Store API: the website channel a key opens (inside the key's tenant scope) */
export async function channelForKey(key: string) {
  const ch = await getPrisma().channelConnection.findFirst({
    where: { channelCode: WEBSITE_CHANNEL, accessToken: sha256(key) },
  });
  if (!ch) return { error: "UNAUTHORIZED" as const };
  if (!ch.isActive) return { error: "DISABLED" as const };
  const config = parseWebsiteConfig(ch.config);
  if (!config) return { error: "NOT_CONFIGURED" as const };
  return { channel: { id: ch.id, config } };
}

export type StoreChannel = { id: number; config: WebsiteConfig };

// ─── Sync log ────────────────────────────────────────────────────────────────

export interface SyncEvent {
  channelId: number | null;
  syncType: "order" | "payment" | "stock" | "product" | "auth";
  direction: "push" | "pull";
  status: "success" | "failed" | "partial";
  message: string;
  details?: Record<string, unknown>;
}

/** Append a sync log line (never throws — logging must not break the order flow) */
export async function logSync(e: SyncEvent) {
  try {
    const prisma = getPrisma();
    await prisma.syncLog.create({
      data: {
        channelId: e.channelId,
        syncType: e.syncType,
        direction: e.direction,
        status: e.status,
        message: e.message.slice(0, 2000),
        details: e.details ? JSON.stringify(e.details).slice(0, 60_000) : null,
      },
    });
    if (e.channelId && e.status === "success")
      await prisma.channelConnection.update({
        where: { id: e.channelId },
        data: { lastSyncAt: new Date() },
      });
  } catch (err) {
    console.error("[omni] sync log failed:", err);
  }
}

/** Sync problem that needs a person (#87): log it and raise the `sync_failed` notification */
export async function reportSyncFailure(
  e: Omit<SyncEvent, "status"> & {
    link?: string;
    dedupeKey: string;
    branchId?: number | null;
    /** P6.2: Shopee / Lazada… (default Website) */
    channelName?: string;
  },
) {
  const { channelName = "Website", link, dedupeKey, branchId, ...event } = e;
  await logSync({ ...event, status: "failed" });
  await notify({
    type: "sync_failed",
    title: `Đồng bộ ${channelName} lỗi: ${e.message}`.slice(0, 250),
    content: e.details ? JSON.stringify(e.details).slice(0, 500) : null,
    link: link ?? "/omni",
    branchId: branchId ?? null,
    dedupeKey,
    vars: { channel: channelName, error: e.message },
  });
}

/** Sync log of one channel (by channel_code) or of every channel (P6.2: `/omni` overview) */
export async function listSyncLogs(input: {
  page: number;
  limit: number;
  status?: "success" | "failed" | "partial";
  channel?: string;
}) {
  let channelId: number | undefined;
  if (input.channel) {
    const ch = await getPrisma().channelConnection.findFirst({
      where: { channelCode: input.channel },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!ch) return { items: [], total: 0, page: input.page, limit: input.limit };
    channelId = ch.id;
  }
  const where = {
    ...(channelId ? { channelId } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total] = await Promise.all([
    getPrisma().syncLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { channel: { select: { channelCode: true } } },
    }),
    getPrisma().syncLog.count({ where }),
  ]);
  return {
    items: items.map((l) => ({
      id: l.id,
      channel: l.channel?.channelCode ?? null,
      syncType: l.syncType,
      direction: l.direction,
      status: l.status,
      message: l.message,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page: input.page,
    limit: input.limit,
  };
}
