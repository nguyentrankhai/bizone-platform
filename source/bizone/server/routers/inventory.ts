import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import {
  listInventory,
  getInventorySummary,
  getStockByWarehouse,
  listTransactionTypes,
  listTransactions,
  getTransaction,
  createTransaction,
  confirmTransaction,
  cancelTransaction,
  listBatches,
} from "@/server/services/inventory.service";
import {
  listInventorySchema,
  createTransactionSchema,
  listTransactionsSchema,
  listBatchesSchema,
} from "@/lib/validators/inventory";
import {
  assertWarehouse,
  assertInventoryTransaction,
  scopeWarehouseIds,
} from "@/server/middleware/branchScope";

export const inventoryRouter = router({
  /** GET tồn kho theo kho / sản phẩm */
  list: permissionProcedure("inventory:read")
    .input(listInventorySchema)
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return listInventory(input, await scopeWarehouseIds(ctx.branch));
    }),

  /** GET tổng hợp tồn kho */
  summary: permissionProcedure("inventory:read")
    .input(z.object({ warehouseId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return getInventorySummary(input.warehouseId, await scopeWarehouseIds(ctx.branch));
    }),

  /** GET tổng tồn theo kho (biểu đồ) */
  stockByWarehouse: permissionProcedure("inventory:read").query(async ({ ctx }) => {
    return getStockByWarehouse(await scopeWarehouseIds(ctx.branch));
  }),

  // ── Transaction types ──────────────────────────────────────────────────────

  /** GET danh sách loại phiếu kho */
  transactionTypes: permissionProcedure("inventory:read").query(async () => {
    return listTransactionTypes();
  }),

  // ── Transactions ───────────────────────────────────────────────────────────

  /** GET danh sách phiếu kho */
  transactions: permissionProcedure("inventory:read")
    .input(listTransactionsSchema)
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return listTransactions(input, await scopeWarehouseIds(ctx.branch));
    }),

  /** GET chi tiết phiếu kho */
  transaction: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return getTransaction(input.id);
    }),

  /** POST tạo phiếu kho (draft) */
  createTransaction: permissionProcedure("inventory:write")
    .input(createTransactionSchema)
    .mutation(async ({ input, ctx }) => {
      await assertWarehouse(ctx.branch, input.warehouseId);
      return createTransaction(input, await resolveDbUserId(ctx.user!));
    }),

  /** POST xác nhận phiếu → cập nhật tồn kho */
  confirmTransaction: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return confirmTransaction(input.id, await resolveDbUserId(ctx.user!));
    }),

  /** POST huỷ phiếu kho */
  cancelTransaction: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return cancelTransaction(input.id);
    }),

  // ── Batches ────────────────────────────────────────────────────────────────

  /** GET danh sách lô hàng */
  batches: permissionProcedure("inventory:read")
    .input(listBatchesSchema)
    .query(async ({ input, ctx }) => {
      if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
      return listBatches(input, await scopeWarehouseIds(ctx.branch));
    }),
});
