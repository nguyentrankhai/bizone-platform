import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as promo from "@/server/services/promotion.service";
import {
  buyXGetYSchema,
  comboSchema,
  marketingReportSchema,
  toggleSchema,
  updateBuyXGetYSchema,
  updateComboSchema,
} from "@/lib/validators/marketing";

const idInput = z.object({ id: z.number().int().positive() });

/** Buy X get Y (SRS-MKT-05), combos (SRS-MKT-04) and the effectiveness report */
export const promotionRouter = router({
  buyXGetY: router({
    list: permissionProcedure("marketing:promotion").query(() => promo.listBuyXGetY()),
    create: permissionProcedure("marketing:promotion")
      .input(buyXGetYSchema)
      .mutation(async ({ input, ctx }) =>
        promo.createBuyXGetY(input, await resolveDbUserId(ctx.user)),
      ),
    update: permissionProcedure("marketing:promotion")
      .input(updateBuyXGetYSchema)
      .mutation(({ input }) => promo.updateBuyXGetY(input.id, input.data)),
    setActive: permissionProcedure("marketing:promotion")
      .input(toggleSchema)
      .mutation(({ input }) => promo.toggleBuyXGetY(input.id, input.isActive)),
    delete: permissionProcedure("marketing:promotion")
      .input(idInput)
      .mutation(({ input }) => promo.deleteBuyXGetY(input.id)),
  }),
  combo: router({
    list: permissionProcedure("marketing:promotion").query(() => promo.listCombos()),
    create: permissionProcedure("marketing:promotion")
      .input(comboSchema)
      .mutation(async ({ input, ctx }) =>
        promo.createCombo(input, await resolveDbUserId(ctx.user)),
      ),
    update: permissionProcedure("marketing:promotion")
      .input(updateComboSchema)
      .mutation(({ input }) => promo.updateCombo(input.id, input.data)),
    setActive: permissionProcedure("marketing:promotion")
      .input(toggleSchema)
      .mutation(({ input }) => promo.toggleCombo(input.id, input.isActive)),
    delete: permissionProcedure("marketing:promotion")
      .input(idInput)
      .mutation(({ input }) => promo.deleteCombo(input.id)),
  }),
  report: permissionProcedure("report:read")
    .input(marketingReportSchema)
    .query(({ input }) => promo.marketingReport(input)),
});
