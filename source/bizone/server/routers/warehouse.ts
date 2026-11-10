import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "@/server/services/inventory.service";
import { createWarehouseSchema, updateWarehouseSchema } from "@/lib/validators/inventory";
import { assertWarehouse, assertBranch, scopeWarehouseIds } from "@/server/middleware/branchScope";

export const warehouseRouter = router({
  /** GET /trpc/warehouse.list */
  list: permissionProcedure("inventory:read").query(async ({ ctx }) => {
    // P4.6: warehouses of the branch the user works on (+ store-wide ones)
    return listWarehouses(ctx.tenantId!, await scopeWarehouseIds(ctx.branch));
  }),

  /** GET /trpc/warehouse.get?id=... */
  get: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.id);
      return getWarehouse(input.id);
    }),

  /** POST /trpc/warehouse.create */
  create: permissionProcedure("inventory:write")
    .input(createWarehouseSchema)
    .mutation(async ({ input, ctx }) => {
      assertBranch(ctx.branch, input.branchId);
      return createWarehouse(input);
    }),

  /** PUT /trpc/warehouse.update */
  update: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive(), data: updateWarehouseSchema }))
    .mutation(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.id);
      assertBranch(ctx.branch, input.data.branchId);
      return updateWarehouse(input.id, input.data);
    }),

  /** DELETE /trpc/warehouse.delete */
  delete: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.id);
      await deleteWarehouse(input.id);
      return { success: true };
    }),
});
