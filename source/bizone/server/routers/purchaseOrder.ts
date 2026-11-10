import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { resolveDbUserId } from "@/server/services/user.service";
import * as po from "@/server/services/purchaseOrder.service";
import {
  assertWarehouse,
  scopeWarehouseIds,
  type BranchScope,
} from "@/server/middleware/branchScope";
import {
  cancelPoSchema,
  createPoSchema,
  listPoSchema,
  productLookupSchema,
  receivePoSchema,
  updatePoSchema,
} from "@/lib/validators/supplier";

/** P4.6: a purchase order belongs to the branch of its receiving warehouse */
async function assertPo(scope: BranchScope, id: number) {
  const row = await getPrisma().purchaseOrder.findUnique({
    where: { id },
    select: { warehouseId: true },
  });
  if (!row) throw bizoneError("NOT_FOUND", `Đơn nhập #${id} không tồn tại`);
  if (row.warehouseId) await assertWarehouse(scope, row.warehouseId);
}

/** Purchase orders (SRS-SUP-02): pending → partial → received, or cancelled */
export const purchaseOrderRouter = router({
  list: permissionProcedure("supplier:read")
    .input(listPoSchema)
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return po.listPurchaseOrders(input, await scopeWarehouseIds(ctx.branch));
    }),

  get: permissionProcedure("supplier:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertPo(ctx.branch, input.id);
      return po.getPurchaseOrder(input.id);
    }),

  warehouseOptions: permissionProcedure("supplier:read").query(async ({ ctx }) =>
    po.warehouseOptions(await scopeWarehouseIds(ctx.branch)),
  ),

  productLookup: permissionProcedure("supplier:read")
    .input(productLookupSchema)
    .query(({ input }) => po.productLookup(input)),

  create: permissionProcedure("supplier:manage_po")
    .input(createPoSchema)
    .mutation(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.warehouseId);
      return po.createPurchaseOrder(input, await resolveDbUserId(ctx.user));
    }),

  update: permissionProcedure("supplier:manage_po")
    .input(updatePoSchema)
    .mutation(async ({ input, ctx }) => {
      await assertPo(ctx.branch, input.id);
      await assertWarehouse(ctx.branch, input.warehouseId);
      return po.updatePurchaseOrder(input);
    }),

  /** Goods arrived: creates a confirmed stock receipt + supplier debt */
  receive: permissionProcedure("supplier:manage_po")
    .input(receivePoSchema)
    .mutation(async ({ input, ctx }) => {
      await assertPo(ctx.branch, input.id);
      return po.receivePurchaseOrder(input, await resolveDbUserId(ctx.user));
    }),

  cancel: permissionProcedure("supplier:manage_po")
    .input(cancelPoSchema)
    .mutation(async ({ input, ctx }) => {
      await assertPo(ctx.branch, input.id);
      return po.cancelPurchaseOrder(input);
    }),
});
