import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
const optText = (max: number) => z.string().trim().max(max).optional();
const money = z.number().finite().min(0, "Số tiền không được âm");

// ─── Supplier ────────────────────────────────────────────────────────────────

/** VN tax code: 10 digits, or 10 digits + "-" + 3 digits for a branch */
const taxCode = z
  .string()
  .trim()
  .regex(/^\d{10}(-\d{3})?$/, "Mã số thuế gồm 10 chữ số (chi nhánh: 10 số + '-' + 3 số)");

const supplierFields = {
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Mã NCC chỉ gồm chữ, số, '-' và '_'")
    .optional(),
  name: z.string().trim().min(1, "Tên nhà cung cấp không được trống").max(255),
  taxCode: taxCode.optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+().\s-]{7,20}$/, "Số điện thoại không hợp lệ")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Email không hợp lệ").max(255).optional().or(z.literal("")),
  address: optText(1000),
  contactPerson: optText(255),
  /** Free text ("Thanh toán trong 30 ngày"); the first number of days sets debt due dates */
  paymentTerms: optText(255),
  notes: optText(2000),
};

export const createSupplierSchema = z.object(supplierFields);
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = z.object({
  id: z.number().int().positive(),
  data: z.object({ ...supplierFields, isActive: z.boolean().optional() }).partial(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
  /** Only suppliers that still have money owed (overdue = past due date) */
  debt: z.enum(["owing", "overdue"]).optional(),
});
export type ListSuppliersInput = z.infer<typeof listSuppliersSchema>;

export const supplierHistorySchema = z.object({
  supplierId: z.number().int().positive(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});
export type SupplierHistoryInput = z.infer<typeof supplierHistorySchema>;

export const recordPaymentSchema = z.object({
  supplierId: z.number().int().positive(),
  /** Pay one purchase order's debt; omitted → allocate to the oldest open debts first */
  poId: z.number().int().positive().optional(),
  amount: z.number().finite().positive("Số tiền phải lớn hơn 0"),
  paymentDate: dateKey.optional(),
  paymentMethod: z.enum(["cash", "bank_transfer", "card", "other"]).default("bank_transfer"),
  referenceCode: optText(255),
  notes: optText(1000),
  /** P4.8: quỹ chi tiền (phiếu chi "Tiền nhập hàng" luôn được ghi; có quỹ thì quỹ giảm) */
  fundId: z.number().int().positive().optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const priceComparisonSchema = z.object({
  /** One product; omitted → products bought from at least `minSuppliers` suppliers */
  productId: z.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  supplierId: z.number().int().positive().optional(),
  minSuppliers: z.number().int().min(1).max(10).default(2),
  limit: z.number().int().positive().max(100).default(50),
});
export type PriceComparisonInput = z.infer<typeof priceComparisonSchema>;

// ─── Purchase order ─────────────────────────────────────────────────────────

export const poItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0").max(1_000_000),
  unitCost: money.max(1_000_000_000),
  discountPercent: z.number().min(0).max(100).default(0),
});
export type PoItemInput = z.infer<typeof poItemSchema>;

const poFields = {
  supplierId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  items: z
    .array(poItemSchema)
    .min(1, "Đơn nhập phải có ít nhất 1 sản phẩm")
    .max(500)
    .refine(
      (items) =>
        new Set(items.map((i) => `${i.productId}:${i.variantId ?? 0}`)).size === items.length,
      "Mỗi sản phẩm / biến thể chỉ xuất hiện một lần trong đơn",
    ),
  discountAmount: money.default(0),
  taxAmount: money.default(0),
  notes: optText(2000),
};

export const createPoSchema = z.object(poFields);
export type CreatePoInput = z.infer<typeof createPoSchema>;

export const updatePoSchema = z.object({ id: z.number().int().positive(), ...poFields });
export type UpdatePoInput = z.infer<typeof updatePoSchema>;

export const listPoSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  supplierId: z.number().int().positive().optional(),
  warehouseId: z.number().int().positive().optional(),
  status: z.enum(["pending", "partial", "received", "cancelled"]).optional(),
  search: z.string().trim().max(100).optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
});
export type ListPoInput = z.infer<typeof listPoSchema>;

export const receivePoSchema = z.object({
  id: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().int().min(0).max(1_000_000),
        batchCode: optText(100),
        manufactureDate: dateKey.optional(),
        expiryDate: dateKey.optional(),
      }),
    )
    .min(1)
    .refine((items) => items.some((i) => i.quantity > 0), "Chưa nhập số lượng nhận"),
  /** Debt due date; default = receipt date + days in the supplier's payment terms */
  dueDate: dateKey.optional(),
  notes: optText(1000),
});
export type ReceivePoInput = z.infer<typeof receivePoSchema>;

export const cancelPoSchema = z.object({
  id: z.number().int().positive(),
  reason: optText(500),
});
export type CancelPoInput = z.infer<typeof cancelPoSchema>;

export const productLookupSchema = z.object({
  q: z.string().trim().min(1).max(100),
  supplierId: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(30).default(15),
});
export type ProductLookupInput = z.infer<typeof productLookupSchema>;
