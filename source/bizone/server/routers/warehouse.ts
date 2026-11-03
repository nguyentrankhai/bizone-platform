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

export const warehouseRouter = router({
  /** GET /trpc/warehouse.list */
  list: permissionProcedure("inventory:read").query(async ({ ctx }) => {
    return listWarehouses(ctx.tenantId!);
  }),

  /** GET /trpc/warehouse.get?id=... */
  get: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getWarehouse(input.id);
    }),

  /** POST /trpc/warehouse.create */
  create: permissionProcedure("inventory:write")
    .input(createWarehouseSchema)
    .mutation(async ({ input }) => {
      return createWarehouse(input);
    }),

  /** PUT /trpc/warehouse.update */
  update: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive(), data: updateWarehouseSchema }))
    .mutation(async ({ input }) => {
      return updateWarehouse(input.id, input.data);
    }),

  /** DELETE /trpc/warehouse.delete */
  delete: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteWarehouse(input.id);
      return { success: true };
    }),
});
