import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  campaignAudienceSchema,
  createCampaignSchema,
  listCampaignsSchema,
  sendCampaignSchema,
  updateCampaignSchema,
} from "@/lib/validators/notification";
import * as campaigns from "@/server/services/campaign.service";
import { resolveDbUserId } from "@/server/services/user.service";
import { getPrisma } from "@/lib/prisma";

/** Marketing campaigns SMS / Email (SRS-MKT-06, #70) */
const p = permissionProcedure("marketing:campaign");
const id = z.object({ id: z.number().int().positive() });

export const campaignRouter = router({
  list: p.input(listCampaignsSchema).query(({ input }) => campaigns.listCampaigns(input)),
  get: p.input(id).query(({ input }) => campaigns.getCampaign(input.id)),
  /** Customer groups for the audience picker */
  groups: p.query(() =>
    getPrisma().customerGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ),
  previewAudience: p
    .input(z.object({ channel: z.enum(["email", "sms"]), audience: campaignAudienceSchema }))
    .query(({ input }) => campaigns.previewAudience(input.channel, input.audience)),
  create: p
    .input(createCampaignSchema)
    .mutation(async ({ ctx, input }) =>
      campaigns.createCampaign(input, await resolveDbUserId(ctx.user)),
    ),
  update: p.input(updateCampaignSchema).mutation(({ input }) => campaigns.updateCampaign(input)),
  delete: p.input(id).mutation(({ input }) => campaigns.deleteCampaign(input.id)),
  send: p
    .input(sendCampaignSchema)
    .mutation(({ input }) => campaigns.sendCampaign(input.id, input.scheduledAt)),
  cancel: p.input(id).mutation(({ input }) => campaigns.cancelCampaign(input.id)),
});
