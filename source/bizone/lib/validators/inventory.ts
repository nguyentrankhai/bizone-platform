import { z } from "zod";

// ─── Warehouse ───────────────────────────────────────────────────────────────

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(255),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, "Mã kho chỉ gồm chữ cái, số, dấu gạch ngang và gạch dưới"),
  address: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  branchId: z.number().int().positive().nullable().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

// ─── Inventory query ─────────────────────────────────────────────────────────

export const listInventorySchema = z.object({
  warehouseId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  lowStock: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

// ─── Inventory Transaction ────────────────────────────────────────────────────

export const transactionItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  batchCode: z.string().max(100).nullable().optional(),
  manufactureDate: z.string().datetime({ offset: true }).nullable().optional(),
  expiryDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export const createTransactionSchema = z.object({
  transactionTypeId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  destinationWarehouseId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  referenceType: z.string().max(50).nullable().optional(),
  referenceId: z.number().int().positive().nullable().optional(),
  items: z.array(transactionItemSchema).min(1, "Phiếu phải có ít nhất 1 sản phẩm"),
});

export const listTransactionsSchema = z.object({
  warehouseId: z.number().int().positive().optional(),
  transactionTypeId: z.number().int().positive().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

// ─── Stock Take ───────────────────────────────────────────────────────────────

export const createStockTakeSchema = z.object({
  warehouseId: z.number().int().positive(),
  notes: z.string().nullable().optional(),
});

export const stockTakeItemInputSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  actualQuantity: z.number().nonnegative(),
  unitCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateStockTakeItemsSchema = z.object({
  stockTakeId: z.number().int().positive(),
  items: z.array(stockTakeItemInputSchema).min(1),
});

export const completeStockTakeSchema = z.object({
  stockTakeId: z.number().int().positive(),
});

// ─── Batch queries ────────────────────────────────────────────────────────────

export const listBatchesSchema = z.object({
  warehouseId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  expiringSoon: z.boolean().optional(),
  expired: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type ListInventoryInput = z.infer<typeof listInventorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;
export type CreateStockTakeInput = z.infer<typeof createStockTakeSchema>;
export type UpdateStockTakeItemsInput = z.infer<typeof updateStockTakeItemsSchema>;
export type CompleteStockTakeInput = z.infer<typeof completeStockTakeSchema>;
export type ListBatchesInput = z.infer<typeof listBatchesSchema>;
