import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { websiteConfigSchema } from "@/lib/omni/website";
import { MARKETPLACES, MARKETPLACE_NAME, marketplaceConfigSchema } from "@/lib/omni/marketplace";
import {
  getWebsiteChannel,
  listSyncLogs,
  rotateStoreKey,
  saveWebsiteChannel,
  setWebsiteActive,
  websiteChannel,
} from "@/server/services/omni/websiteChannel.service";
import {
  asBizError,
  channelState,
  disconnectMarketplace,
  findChannel,
  getMarketplaceChannel,
  marketplaceCategories,
  saveMarketplaceConfig,
  setMarketplaceActive,
  startConnect,
} from "@/server/services/omni/marketplaceChannel.service";
import {
  listListings,
  markProductsForPush,
  setListingActive,
} from "@/server/services/omni/productSync.service";
import {
  assertOrderImport,
  requireConnectedChannel,
} from "@/server/services/omni/orderSync.service";
import { connectorFor } from "@/server/services/omni/marketplace/registry";
import { enqueueOmniSync } from "@/server/queue/omniSync";
import { ensureDbUserId } from "@/server/services/user.service";

const marketplace = z.enum(MARKETPLACES);

/**
 * Omni Channel (admin only, `omni:manage`):
 * - P6.1 website: settings, store key, sync log
 * - P6.2 marketplaces (Shopee / Lazada) + P6.3 (TikTok Shop, Facebook / Instagram catalog): OAuth connect, settings + category map, listings,
 *   manual sync; background sync runs in the worker (`server/queue/omniSync.ts`)
 */
export const omniRouter = router({
  /** Channel cards of `/omni` */
  channels: permissionProcedure("omni:manage").query(async () => {
    const web = await websiteChannel();
    const markets = await Promise.all(
      MARKETPLACES.map(async (code) => {
        const ch = await findChannel(code);
        return {
          code,
          name: MARKETPLACE_NAME[code],
          shopName: ch?.shopId ? ch.channelName : null,
          state: channelState(ch),
          platformConfigured: connectorFor(code).configured(),
          lastSyncAt: ch?.lastSyncAt?.toISOString() ?? null,
        };
      }),
    );
    return {
      website: web
        ? {
            name: web.channelName,
            isActive: web.isActive,
            hasKey: !!web.accessToken,
            lastSyncAt: web.lastSyncAt?.toISOString() ?? null,
          }
        : null,
      marketplaces: markets,
    };
  }),

  website: permissionProcedure("omni:manage").query(() => getWebsiteChannel()),

  saveWebsite: permissionProcedure("omni:manage")
    .input(websiteConfigSchema)
    .mutation(({ input }) => saveWebsiteChannel(input)),

  /** New store key, shown once — paste it into the storefront's STORE_KEYS */
  rotateKey: permissionProcedure("omni:manage").mutation(() => rotateStoreKey()),

  setActive: permissionProcedure("omni:manage")
    .input(z.object({ isActive: z.boolean() }))
    .mutation(({ input }) => setWebsiteActive(input.isActive)),

  syncLogs: permissionProcedure("omni:manage")
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        status: z.enum(["success", "failed", "partial"]).optional(),
        /** channel_code; omitted = every channel */
        channel: z.enum(["website", ...MARKETPLACES]).optional(),
      }),
    )
    .query(({ input }) => listSyncLogs(input)),

  // ─── P6.2 marketplaces ─────────────────────────────────────────────────────

  marketplace: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace }))
    .query(({ input }) => getMarketplaceChannel(input.code)),

  saveMarketplace: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace, config: marketplaceConfigSchema }))
    .mutation(({ input }) => saveMarketplaceConfig(input.code, input.config)),

  /** Authorize URL — the browser goes there, the marketplace comes back to the OAuth callback */
  connect: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace }))
    .mutation(async ({ input, ctx }) =>
      startConnect(input.code, ctx.user ? await ensureDbUserId(ctx.user) : null),
    ),

  disconnect: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace }))
    .mutation(({ input }) => disconnectMarketplace(input.code)),

  setMarketplaceActive: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace, isActive: z.boolean() }))
    .mutation(({ input }) => setMarketplaceActive(input.code, input.isActive)),

  categories: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace, refresh: z.boolean().default(false) }))
    .query(({ input }) => marketplaceCategories(input.code, input.refresh)),

  listings: permissionProcedure("omni:manage")
    .input(
      z.object({
        code: marketplace,
        search: z.string().trim().max(100).optional(),
        status: z.enum(["none", "synced", "pending", "error", "paused"]).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => listListings(input.code, input)),

  /** Publish products (new listings) / push their price + stock again */
  pushProducts: permissionProcedure("omni:manage")
    .input(
      z.object({
        code: marketplace,
        productIds: z.array(z.number().int().positive()).min(1).max(50),
      }),
    )
    .mutation(async ({ input }) => {
      const ids = [...new Set(input.productIds)];
      const r = await markProductsForPush(input.code, ids);
      await enqueueOmniSync({ kind: "product-push", channelId: r.channelId, productIds: ids });
      return r;
    }),

  setListingActive: permissionProcedure("omni:manage")
    .input(
      z.object({
        code: marketplace,
        productId: z.number().int().positive(),
        isActive: z.boolean(),
      }),
    )
    .mutation(({ input }) => setListingActive(input.code, input.productId, input.isActive)),

  /** "Đồng bộ ngay": orders (pull) and/or price + stock of every listing (push, forced) */
  syncNow: permissionProcedure("omni:manage")
    .input(z.object({ code: marketplace, what: z.enum(["orders", "stock"]) }))
    .mutation(async ({ input }) => {
      try {
        if (input.what === "orders") assertOrderImport(input.code);
        const channelId = await requireConnectedChannel(input.code);
        await enqueueOmniSync(
          input.what === "orders"
            ? { kind: "order-sync", channelId }
            : { kind: "stock-push", channelId, force: true },
        );
        return { queued: true };
      } catch (e) {
        throw asBizError(e);
      }
    }),
});
