import { z } from "zod";

/**
 * Times come from <input type="datetime-local"> as Vietnam wall-clock "YYYY-MM-DDTHH:mm"
 * (an explicit offset / "Z" is accepted too) and are stored as UTC instants.
 */
const vnDateTime = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
    "Thời gian phải có dạng YYYY-MM-DDTHH:mm",
  )
  .transform((s, ctx) => {
    const iso = /(Z|[+-]\d{2}:\d{2})$/.test(s) ? s : `${s}+07:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Thời gian không hợp lệ" });
      return z.NEVER;
    }
    return d;
  });

const money = z.number().finite().min(0, "Số tiền không được âm").max(1_000_000_000);
const optMoney = money.nullable().optional();
const optInt = (max = 1_000_000) => z.number().int().min(1).max(max).nullable().optional();
const page = {
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
};

export const CHANNELS = ["pos", "online", "website", "shopee", "lazada", "tiktok"] as const;
export const RANKINGS = ["silver", "gold", "vip", "diamond"] as const;

// ─── Coupon ─────────────────────────────────────────────────────────────────

const couponCode = z
  .string()
  .trim()
  .min(3, "Mã tối thiểu 3 ký tự")
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ không dấu, số, '-' và '_'")
  .transform((s) => s.toUpperCase());

const couponBase = z.object({
  code: couponCode,
  name: z.string().trim().min(1, "Tên chương trình không được trống").max(255),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  value: money,
  minOrderAmount: optMoney,
  maxDiscount: optMoney,
  usageLimit: optInt(),
  usagePerCustomer: optInt(1000),
  startDate: vnDateTime.nullable().optional(),
  endDate: vnDateTime.nullable().optional(),
  /** Empty = every channel */
  channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).default([]),
  isActive: z.boolean().default(true),
  /** Apply by itself at the POS when no code is entered (best auto coupon wins) */
  autoApply: z.boolean().default(false),
  /** Only these customer rankings (empty = everyone) */
  rankings: z.array(z.enum(RANKINGS)).max(4).default([]),
  /** Discount computed on these categories' lines only (sub-categories included; empty = all) */
  categoryIds: z.array(z.number().int().positive()).max(50).default([]),
});

export const createCouponSchema = couponBase.superRefine((c, ctx) => {
  if (c.type === "percent" && (c.value <= 0 || c.value > 100))
    ctx.addIssue({ code: "custom", path: ["value"], message: "Phần trăm giảm phải từ 0 đến 100" });
  if (c.type === "fixed" && c.value <= 0)
    ctx.addIssue({ code: "custom", path: ["value"], message: "Số tiền giảm phải lớn hơn 0" });
  if (c.startDate && c.endDate && c.endDate <= c.startDate)
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "Thời gian kết thúc phải sau thời gian bắt đầu",
    });
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z.object({
  id: z.number().int().positive(),
  data: createCouponSchema,
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const listCouponsSchema = z.object({
  ...page,
  search: z.string().trim().max(100).optional(),
  /** Status at the time of the request */
  status: z.enum(["running", "scheduled", "expired", "inactive"]).optional(),
  type: z.enum(["percent", "fixed", "free_shipping"]).optional(),
});
export type ListCouponsInput = z.infer<typeof listCouponsSchema>;

export const couponUsageSchema = z.object({ couponId: z.number().int().positive(), ...page });
export type CouponUsageInput = z.infer<typeof couponUsageSchema>;

// ─── Vouchers ───────────────────────────────────────────────────────────────

export const issueVouchersSchema = z
  .object({
    /** Template: discount rule of the vouchers */
    couponId: z.number().int().positive(),
    /** One voucher per customer … */
    customerIds: z.array(z.number().int().positive()).max(500).default([]),
    /** … or per active customer of these rankings … */
    rankings: z.array(z.enum(RANKINGS)).max(4).default([]),
    /** … or N vouchers not bound to anyone */
    count: z.number().int().min(0).max(500).default(0),
    prefix: z
      .string()
      .trim()
      .max(12)
      .regex(/^[A-Za-z0-9]*$/, "Tiền tố chỉ gồm chữ không dấu và số")
      .transform((s) => s.toUpperCase())
      .default("VC"),
    expiredAt: vnDateTime.nullable().optional(),
  })
  .refine((v) => v.customerIds.length > 0 || v.rankings.length > 0 || v.count > 0, {
    message: "Chọn khách hàng, hạng khách hàng hoặc số lượng voucher",
  });
export type IssueVouchersInput = z.infer<typeof issueVouchersSchema>;

export const listVouchersSchema = z.object({
  ...page,
  couponId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  status: z.enum(["active", "used", "expired", "cancelled"]).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListVouchersInput = z.infer<typeof listVouchersSchema>;

// ─── Flash sale ─────────────────────────────────────────────────────────────

export const flashItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  flashPrice: money,
  /** 0 = unlimited */
  quantityLimit: z.number().int().min(0).max(1_000_000).default(0),
  /** 0 = unlimited */
  perCustomerLimit: z.number().int().min(0).max(1000).default(0),
});
export type FlashItemInput = z.infer<typeof flashItemSchema>;

const flashBase = z.object({
  name: z.string().trim().min(1, "Tên flash sale không được trống").max(255),
  description: z.string().trim().max(2000).optional(),
  startTime: vnDateTime,
  endTime: vnDateTime,
  items: z
    .array(flashItemSchema)
    .min(1, "Thêm ít nhất 1 sản phẩm")
    .max(200)
    .refine(
      (items) =>
        new Set(items.map((i) => `${i.productId}:${i.variantId ?? 0}`)).size === items.length,
      "Mỗi sản phẩm / biến thể chỉ một dòng",
    ),
});

export const createFlashSaleSchema = flashBase.refine((f) => f.endTime > f.startTime, {
  path: ["endTime"],
  message: "Thời gian kết thúc phải sau thời gian bắt đầu",
});
export type CreateFlashSaleInput = z.infer<typeof createFlashSaleSchema>;

export const updateFlashSaleSchema = z.object({
  id: z.number().int().positive(),
  data: createFlashSaleSchema,
});
export type UpdateFlashSaleInput = z.infer<typeof updateFlashSaleSchema>;

export const listFlashSalesSchema = z.object({
  ...page,
  status: z.enum(["scheduled", "active", "ended", "cancelled"]).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListFlashSalesInput = z.infer<typeof listFlashSalesSchema>;

// ─── Buy X get Y / combos ───────────────────────────────────────────────────

const bxgyBase = z.object({
  name: z.string().trim().min(1, "Tên chương trình không được trống").max(255),
  buyProductId: z.number().int().positive().nullable().optional(),
  buyCategoryId: z.number().int().positive().nullable().optional(),
  buyQuantity: z.number().int().min(1).max(1000),
  getProductId: z.number().int().positive().nullable().optional(),
  getCategoryId: z.number().int().positive().nullable().optional(),
  getQuantity: z.number().int().min(1).max(1000),
  getDiscountPercent: z.number().min(1).max(100).default(100),
  startDate: vnDateTime,
  endDate: vnDateTime,
  isActive: z.boolean().default(true),
});

export const buyXGetYSchema = bxgyBase.superRefine((r, ctx) => {
  if (!!r.buyProductId === !!r.buyCategoryId)
    ctx.addIssue({
      code: "custom",
      path: ["buyProductId"],
      message: "Chọn 1 sản phẩm HOẶC 1 danh mục cần mua",
    });
  if (!!r.getProductId === !!r.getCategoryId)
    ctx.addIssue({
      code: "custom",
      path: ["getProductId"],
      message: "Chọn 1 sản phẩm HOẶC 1 danh mục được tặng",
    });
  if (r.endDate <= r.startDate)
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "Thời gian kết thúc phải sau thời gian bắt đầu",
    });
});
export type BuyXGetYInput = z.infer<typeof buyXGetYSchema>;

export const updateBuyXGetYSchema = z.object({
  id: z.number().int().positive(),
  data: buyXGetYSchema,
});

export const comboSchema = z
  .object({
    name: z.string().trim().min(1, "Tên combo không được trống").max(255),
    comboPrice: money,
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(20)
      .refine(
        (items) => new Set(items.map((i) => i.productId)).size === items.length,
        "Mỗi sản phẩm chỉ một dòng",
      )
      .refine(
        (items) => items.reduce((s, i) => s + i.quantity, 0) >= 2,
        "Combo cần ít nhất 2 sản phẩm (hoặc 1 sản phẩm số lượng ≥ 2)",
      ),
    startDate: vnDateTime.nullable().optional(),
    endDate: vnDateTime.nullable().optional(),
    /** 0 = unlimited */
    quantityLimit: z.number().int().min(0).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((c) => !c.startDate || !c.endDate || c.endDate > c.startDate, {
    path: ["endDate"],
    message: "Thời gian kết thúc phải sau thời gian bắt đầu",
  });
export type ComboInput = z.infer<typeof comboSchema>;

export const updateComboSchema = z.object({ id: z.number().int().positive(), data: comboSchema });

export const toggleSchema = z.object({ id: z.number().int().positive(), isActive: z.boolean() });

// ─── Report ─────────────────────────────────────────────────────────────────

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
export const marketingReportSchema = z
  .object({ from: dateKey, to: dateKey })
  .refine((r) => r.from <= r.to, {
    path: ["to"],
    message: "Ngày bắt đầu phải trước ngày kết thúc",
  });
export type MarketingReportInput = z.infer<typeof marketingReportSchema>;
