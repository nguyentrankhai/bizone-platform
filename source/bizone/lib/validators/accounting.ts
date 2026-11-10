import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
const optText = (max: number) => z.string().trim().max(max).optional();
const amount = z
  .number()
  .finite()
  .positive("Số tiền phải lớn hơn 0")
  .max(999_999_999_999, "Số tiền quá lớn");
const id = z.number().int().positive();
const page = {
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
};

const range = z.object({ from: dateKey, to: dateKey }).refine((r) => r.from <= r.to, {
  message: "Từ ngày phải trước hoặc bằng đến ngày",
  path: ["to"],
});

// ─── Funds ───────────────────────────────────────────────────────────────────

const fundFields = {
  name: z.string().trim().min(1, "Tên quỹ không được trống").max(255),
  type: z.enum(["cash", "bank"]).default("cash"),
  accountNo: optText(50),
  description: optText(1000),
  /** null = quỹ chung toàn cửa hàng */
  branchId: id.nullable().optional(),
};

export const createFundSchema = z.object({
  ...fundFields,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Mã quỹ chỉ gồm chữ, số, '-' và '_'")
    .optional(),
  openingBalance: z.number().finite().min(0, "Số dư đầu không được âm").default(0),
});
export type CreateFundInput = z.infer<typeof createFundSchema>;

export const updateFundSchema = z.object({
  id,
  name: fundFields.name.optional(),
  accountNo: fundFields.accountNo,
  description: fundFields.description,
  branchId: fundFields.branchId,
  isActive: z.boolean().optional(),
});
export type UpdateFundInput = z.infer<typeof updateFundSchema>;

export const listFundsSchema = z
  .object({ includeInactive: z.boolean().default(false), branchId: id.optional() })
  .default({ includeInactive: false });
export type ListFundsInput = z.infer<typeof listFundsSchema>;

export const transferSchema = z
  .object({
    fromFundId: id,
    toFundId: id,
    amount,
    description: optText(500),
  })
  .refine((t) => t.fromFundId !== t.toFundId, {
    message: "Quỹ chuyển và quỹ nhận phải khác nhau",
    path: ["toFundId"],
  });
export type TransferInput = z.infer<typeof transferSchema>;

export const adjustFundSchema = z.object({
  fundId: id,
  /** Số tiền đếm / sao kê thực tế */
  actualBalance: z.number().finite().min(0, "Số dư thực tế không được âm"),
  reason: z.string().trim().min(1, "Nhập lý do điều chỉnh").max(500),
});
export type AdjustFundInput = z.infer<typeof adjustFundSchema>;

export const depositSessionSchema = z.object({
  sessionId: id,
  fundId: id,
  /** Omitted → the counted cash at closing */
  amount: amount.optional(),
  description: optText(500),
});
export type DepositSessionInput = z.infer<typeof depositSessionSchema>;

export const fundLedgerSchema = z
  .object({
    fundId: id,
    from: dateKey,
    to: dateKey,
    direction: z.enum(["in", "out"]).optional(),
    /** Only movements of receipts / payments in this category (and its children) */
    categoryId: id.optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(200).default(100),
  })
  .refine((r) => r.from <= r.to, {
    message: "Từ ngày phải trước hoặc bằng đến ngày",
    path: ["to"],
  });
export type FundLedgerInput = z.infer<typeof fundLedgerSchema>;

export const sessionsToDepositSchema = z
  .object({ days: z.number().int().positive().max(90).default(14) })
  .default({ days: 14 });

// ─── Categories ──────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Tên danh mục không được trống").max(255),
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Mã danh mục chỉ gồm chữ thường, số và '_'")
    .optional(),
  type: z.enum(["revenue", "expense", "both"]),
  parentId: id.nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id,
  name: z.string().trim().min(1, "Tên danh mục không được trống").max(255).optional(),
  type: z.enum(["revenue", "expense", "both"]).optional(),
  parentId: id.nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ─── Receipts / payments (phiếu thu / chi) ───────────────────────────────────

const recordFields = {
  categoryId: id,
  /** null = không qua quỹ (ghi nhận sổ thu chi, không đổi số dư quỹ) */
  fundId: id.nullable().optional(),
  amount,
  date: dateKey.optional(),
  description: optText(2000),
  partnerName: optText(255),
};

export const createRecordSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  ...recordFields,
  /** Chi nhánh khi quỹ là quỹ chung (bỏ trống = chi nhánh đang chọn / toàn cửa hàng) */
  branchId: id.nullable().optional(),
});
export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const updateRecordSchema = z.object({
  id,
  categoryId: recordFields.categoryId.optional(),
  fundId: recordFields.fundId,
  amount: amount.optional(),
  date: dateKey.optional(),
  description: recordFields.description,
  partnerName: recordFields.partnerName,
});
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;

export const cancelRecordSchema = z.object({
  id,
  reason: z.string().trim().min(1, "Nhập lý do huỷ phiếu").max(500),
});
export type CancelRecordInput = z.infer<typeof cancelRecordSchema>;

export const listRecordsSchema = z
  .object({
    ...page,
    from: dateKey.optional(),
    to: dateKey.optional(),
    type: z.enum(["revenue", "expense"]).optional(),
    categoryId: id.optional(),
    fundId: id.optional(),
    branchId: id.optional(),
    status: z.enum(["active", "cancelled", "all"]).default("active"),
    search: optText(100),
  })
  .default({ page: 1, pageSize: 20, status: "active" });
export type ListRecordsInput = z.infer<typeof listRecordsSchema>;

// ─── Reports ─────────────────────────────────────────────────────────────────

export const periodSchema = range.and(z.object({ branchId: id.optional() }));
export type PeriodInput = z.infer<typeof periodSchema>;

export const debtSummarySchema = z
  .object({
    kind: z.enum(["receivable", "payable"]),
    search: optText(100),
    overdueOnly: z.boolean().default(false),
    ...page,
  })
  .default({ kind: "receivable", overdueOnly: false, page: 1, pageSize: 20 });
export type DebtSummaryInput = z.infer<typeof debtSummarySchema>;

export const reconciliationSchema = range.and(
  z.object({
    branchId: id.optional(),
    /** Exceptions list: only rows needing attention (default) or every invoice */
    onlyIssues: z.boolean().default(true),
    limit: z.number().int().positive().max(500).default(200),
  }),
);
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;
