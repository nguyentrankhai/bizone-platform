import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import {
  createStockTake,
  getStockTake,
  listStockTakes,
  updateStockTakeItems,
  completeStockTake,
  cancelStockTake,
} from "@/server/services/inventory.service";
import {
  createStockTakeSchema,
  updateStockTakeItemsSchema,
  completeStockTakeSchema,
} from "@/lib/validators/inventory";
import {
  assertWarehouse,
  assertStockTake,
  scopeWarehouseIds,
} from "@/server/middleware/branchScope";

export const stockTakeRouter = router({
  /** GET danh sách phiếu kiểm kê */
  list: permissionProcedure("inventory:read")
    .input(
      z.object({
        warehouseId: z.number().int().positive().optional(),
        status: z.enum(["draft", "in_progress", "completed", "cancelled"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return listStockTakes(
        input.warehouseId,
        input.status,
        input.page,
        input.pageSize,
        await scopeWarehouseIds(ctx.branch),
      );
    }),

  /** GET chi tiết phiếu kiểm kê (kèm tất cả items) */
  get: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertStockTake(ctx.branch, input.id);
      return getStockTake(input.id);
    }),

  /**
   * POST tạo phiếu kiểm kê mới
   * Tự động điền items từ tồn kho hiện tại của kho
   */
  create: permissionProcedure("inventory:write")
    .input(createStockTakeSchema)
    .mutation(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.warehouseId);
      return createStockTake(input, await resolveDbUserId(ctx.user!));
    }),

  /**
   * PUT cập nhật số lượng thực tế cho các items
   * Tự động tính chênh lệch; status → in_progress nếu đang draft
   */
  updateItems: permissionProcedure("inventory:write")
    .input(updateStockTakeItemsSchema)
    .mutation(async ({ input, ctx }) => {
      await assertStockTake(ctx.branch, input.stockTakeId);
      return updateStockTakeItems(input);
    }),

  /**
   * POST hoàn thành kiểm kê — điều chỉnh tồn kho theo số thực tế
   * Chỉ admin/warehouse manager mới có quyền approve
   */
  complete: permissionProcedure("inventory:write")
    .input(completeStockTakeSchema)
    .mutation(async ({ input, ctx }) => {
      await assertStockTake(ctx.branch, input.stockTakeId);
      return completeStockTake(input.stockTakeId, await resolveDbUserId(ctx.user!));
    }),

  /** POST huỷ phiếu kiểm kê */
  cancel: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertStockTake(ctx.branch, input.id);
      return cancelStockTake(input.id);
    }),
});
