import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  assertWarehouse,
  assertInventoryTransaction,
  scopeWarehouseIds,
} from "@/server/middleware/branchScope";
import { resolveDbUserId } from "@/server/services/user.service";
import {
  listTransactions,
  getTransaction,
  createTransaction,
  confirmTransaction,
  cancelTransaction,
} from "@/server/services/inventory.service";
import { transactionItemSchema } from "@/lib/validators/inventory";

// Transfer uses InventoryTransaction with direction="out" + destinationWarehouseId
// We find the built-in "transfer_out" transaction type by code
const TRANSFER_TYPE_CODE = "transfer_out";

import { getPrisma } from "@/lib/prisma";

async function getTransferTypeId(): Promise<number> {
  const prisma = getPrisma();
  const txType = await prisma.inventoryTransactionType.findFirst({
    where: { code: TRANSFER_TYPE_CODE },
  });
  if (!txType) throw new Error(`Loại phiếu "${TRANSFER_TYPE_CODE}" chưa được seed vào DB`);
  return txType.id;
}

export const transferRouter = router({
  /**
   * Kho đích có thể chọn: mọi kho đang hoạt động của cửa hàng (chuyển sang chi nhánh khác — P4.6).
   * Chỉ tên/mã/chi nhánh, không lộ tồn kho.
   */
  destinations: permissionProcedure("inventory:write").query(() =>
    getPrisma().warehouse.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, branch: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ),

  /** GET danh sách phiếu chuyển kho */
  list: permissionProcedure("inventory:read")
    .input(
      z.object({
        fromWarehouseId: z.number().int().positive().optional(),
        toWarehouseId: z.number().int().positive().optional(),
        status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.fromWarehouseId) await assertWarehouse(ctx.branch, input.fromWarehouseId);
      return listTransactions(
        {
          warehouseId: input.fromWarehouseId,
          destinationWarehouseId: input.toWarehouseId,
          transactionTypeId: await getTransferTypeId(),
          status: input.status,
          page: input.page,
          pageSize: input.pageSize,
        },
        await scopeWarehouseIds(ctx.branch),
      );
    }),

  /** GET chi tiết phiếu chuyển kho */
  get: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return getTransaction(input.id);
    }),

  /**
   * POST Bước 1: Tạo phiếu chuyển kho (draft)
   * sourceWarehouseId → destinationWarehouseId
   */
  create: permissionProcedure("inventory:write")
    .input(
      z.object({
        sourceWarehouseId: z.number().int().positive(),
        destinationWarehouseId: z.number().int().positive(),
        notes: z.string().nullable().optional(),
        items: z.array(transactionItemSchema).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Source must be in the user's scope; the destination may be another branch's warehouse
      await assertWarehouse(ctx.branch, input.sourceWarehouseId);
      const typeId = await getTransferTypeId();
      return createTransaction(
        {
          transactionTypeId: typeId,
          warehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          notes: input.notes,
          items: input.items,
        },
        await resolveDbUserId(ctx.user!),
      );
    }),

  /**
   * POST Bước 2+3: Xác nhận chuyển kho
   * Trừ tồn kho nguồn và cộng tồn kho đích trong một transaction
   */
  confirm: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return confirmTransaction(input.id, await resolveDbUserId(ctx.user!));
    }),

  /** POST Huỷ phiếu chuyển kho */
  cancel: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertInventoryTransaction(ctx.branch, input.id);
      return cancelTransaction(input.id);
    }),
});
