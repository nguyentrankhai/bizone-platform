import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as promo from "@/server/services/promotion.service";
import {
  createFlashSaleSchema,
  listFlashSalesSchema,
  updateFlashSaleSchema,
} from "@/lib/validators/marketing";

const idInput = z.object({ id: z.number().int().positive() });

/** Flash sales (SRS-MKT-03): start / end by their time window; POS prices them automatically */
export const flashSaleRouter = router({
  list: permissionProcedure("marketing:flash_sale")
    .input(listFlashSalesSchema)
    .query(({ input }) => promo.listFlashSales(input)),
  get: permissionProcedure("marketing:flash_sale")
    .input(idInput)
    .query(({ input }) => promo.getFlashSale(input.id)),
  create: permissionProcedure("marketing:flash_sale")
    .input(createFlashSaleSchema)
    .mutation(async ({ input, ctx }) =>
      promo.createFlashSale(input, await resolveDbUserId(ctx.user)),
    ),
  update: permissionProcedure("marketing:flash_sale")
    .input(updateFlashSaleSchema)
    .mutation(({ input }) => promo.updateFlashSale(input)),
  end: permissionProcedure("marketing:flash_sale")
    .input(idInput)
    .mutation(({ input }) => promo.endFlashSale(input.id)),
  cancel: permissionProcedure("marketing:flash_sale")
    .input(idInput)
    .mutation(({ input }) => promo.cancelFlashSale(input.id)),
});
