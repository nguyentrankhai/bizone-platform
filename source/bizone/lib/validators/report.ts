import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
const id = z.number().int().positive();

export const reportFilterSchema = z
  .object({
    from: dateKey,
    to: dateKey,
    branchId: id.optional(),
    userId: id.optional(),
    /** Includes sub-categories */
    categoryId: id.optional(),
    compare: z.enum(["previous_period", "previous_year", "none"]).default("previous_period"),
  })
  .refine((f) => f.from <= f.to, {
    message: "Ngày bắt đầu phải trước ngày kết thúc",
    path: ["from"],
  })
  .refine((f) => (Date.parse(f.to) - Date.parse(f.from)) / 86_400_000 < 366, {
    message: "Tối đa 366 ngày mỗi báo cáo",
    path: ["to"],
  });
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const promotionReportSchema = z
  .object({
    /** The promotion window (VN dates, inclusive) — compared with equally long windows around it */
    from: dateKey,
    to: dateKey,
    couponId: id.optional(),
    branchId: id.optional(),
  })
  .refine((f) => f.from <= f.to, {
    message: "Ngày bắt đầu phải trước ngày kết thúc",
    path: ["from"],
  })
  .refine((f) => (Date.parse(f.to) - Date.parse(f.from)) / 86_400_000 < 120, {
    message: "Khung khuyến mãi tối đa 120 ngày",
    path: ["to"],
  });
export type PromotionReportInput = z.infer<typeof promotionReportSchema>;

export const inventoryReportSchema = z.object({
  warehouseId: id.optional(),
  branchId: id.optional(),
  /** Batches expiring within this many days count as "sắp hết hạn" */
  expiringDays: z.number().int().min(1).max(365).default(30),
});
export type InventoryReportInput = z.infer<typeof inventoryReportSchema>;

export const REPORT_TYPES = [
  "revenue",
  "profit",
  "products",
  "staff",
  "promotion",
  "inventory",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const exportReportSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("revenue"),
    format: z.enum(["xlsx", "pdf"]),
    filter: reportFilterSchema,
  }),
  z.object({
    type: z.literal("profit"),
    format: z.enum(["xlsx", "pdf"]),
    filter: reportFilterSchema,
  }),
  z.object({
    type: z.literal("products"),
    format: z.enum(["xlsx", "pdf"]),
    filter: reportFilterSchema,
  }),
  z.object({
    type: z.literal("staff"),
    format: z.enum(["xlsx", "pdf"]),
    filter: reportFilterSchema,
  }),
  z.object({
    type: z.literal("promotion"),
    format: z.enum(["xlsx", "pdf"]),
    filter: promotionReportSchema,
  }),
  z.object({
    type: z.literal("inventory"),
    format: z.enum(["xlsx", "pdf"]),
    filter: inventoryReportSchema,
  }),
]);
export type ExportReportInput = z.infer<typeof exportReportSchema>;
