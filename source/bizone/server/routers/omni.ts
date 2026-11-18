import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { websiteConfigSchema } from "@/lib/omni/website";
import {
  getWebsiteChannel,
  listSyncLogs,
  rotateStoreKey,
  saveWebsiteChannel,
  setWebsiteActive,
} from "@/server/services/omni/websiteChannel.service";

/** P6.1 — Omni Channel: website connection (settings, store key, sync log). Admin only. */
export const omniRouter = router({
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
      }),
    )
    .query(({ input }) => listSyncLogs(input)),
});
