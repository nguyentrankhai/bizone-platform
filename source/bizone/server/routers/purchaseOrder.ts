import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as po from "@/server/services/purchaseOrder.service";
import {
  cancelPoSchema,
  createPoSchema,
  listPoSchema,
  productLookupSchema,
  receivePoSchema,
  updatePoSchema,
} from "@/lib/validators/supplier";

/** Purchase orders (SRS-SUP-02): pending → partial → received, or cancelled */
export const purchaseOrderRouter = router({
  list: permissionProcedure("supplier:read")
    .input(listPoSchema)
    .query(({ input }) => po.listPurchaseOrders(input)),

  get: permissionProcedure("supplier:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => po.getPurchaseOrder(input.id)),

  warehouseOptions: permissionProcedure("supplier:read").query(() => po.warehouseOptions()),

  productLookup: permissionProcedure("supplier:read")
    .input(productLookupSchema)
    .query(({ input }) => po.productLookup(input)),

  create: permissionProcedure("supplier:manage_po")
    .input(createPoSchema)
    .mutation(async ({ input, ctx }) =>
      po.createPurchaseOrder(input, await resolveDbUserId(ctx.user)),
    ),

  update: permissionProcedure("supplier:manage_po")
    .input(updatePoSchema)
    .mutation(({ input }) => po.updatePurchaseOrder(input)),

  /** Goods arrived: creates a confirmed stock receipt + supplier debt */
  receive: permissionProcedure("supplier:manage_po")
    .input(receivePoSchema)
    .mutation(async ({ input, ctx }) =>
      po.receivePurchaseOrder(input, await resolveDbUserId(ctx.user)),
    ),

  cancel: permissionProcedure("supplier:manage_po")
    .input(cancelPoSchema)
    .mutation(({ input }) => po.cancelPurchaseOrder(input)),
});
