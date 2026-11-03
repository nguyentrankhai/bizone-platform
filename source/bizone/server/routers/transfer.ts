import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
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
    .query(async ({ input }) => {
      return listTransactions({
        warehouseId: input.fromWarehouseId,
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  /** GET chi tiết phiếu chuyển kho */
  get: permissionProcedure("inventory:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
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
      const typeId = await getTransferTypeId();
      return createTransaction(
        {
          transactionTypeId: typeId,
          warehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          notes: input.notes,
          items: input.items,
        },
        Number(ctx.user!.id),
      );
    }),

  /**
   * POST Bước 2+3: Xác nhận chuyển kho
   * Trừ tồn kho nguồn và cộng tồn kho đích trong một transaction
   */
  confirm: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      return confirmTransaction(input.id, Number(ctx.user!.id));
    }),

  /** POST Huỷ phiếu chuyển kho */
  cancel: permissionProcedure("inventory:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return cancelTransaction(input.id);
    }),
});
