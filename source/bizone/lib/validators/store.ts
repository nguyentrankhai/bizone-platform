import { z } from "zod";
import { normalizePhone, PASSWORD_RULE, WEBSITE_PAYMENT_METHODS } from "@/lib/omni/website";

/** Store API (P6.1) request bodies / queries */

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Số điện thoại không hợp lệ" });
    return p ?? v;
  });

export const productListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(["newest", "price_asc", "price_desc", "name"]).default("newest"),
});

const cartItems = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      variantId: z.number().int().positive().nullish(),
      quantity: z.number().int().min(1, "Số lượng tối thiểu 1").max(999, "Số lượng tối đa 999"),
    }),
  )
  .min(1, "Giỏ hàng trống")
  .max(50, "Tối đa 50 dòng trong giỏ");

export const quoteSchema = z.object({
  items: cartItems,
  couponCode: z.string().trim().max(100).nullish(),
});

export const createOrderSchema = z.object({
  items: cartItems,
  couponCode: z.string().trim().max(100).nullish(),
  contact: z.object({
    name: z.string().trim().min(2, "Nhập họ tên người nhận").max(255),
    phone,
    address: z.string().trim().min(10, "Nhập địa chỉ giao hàng đầy đủ").max(500),
    email: z.string().trim().email("Email không hợp lệ").max(255).nullish().or(z.literal("")),
  }),
  note: z.string().trim().max(1000).nullish(),
  paymentMethod: z.enum(WEBSITE_PAYMENT_METHODS),
  returnUrl: z.string().url().max(1000).nullish(),
  /** P6.3: utm_source of the link the buyer followed (unknown values are dropped) */
  source: z.string().trim().max(60).nullish(),
});

export const registerStartSchema = z.object({ phone });

export const registerVerifySchema = z.object({
  phone,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Mã xác nhận gồm 6 chữ số"),
  fullName: z.string().trim().min(2, "Nhập họ tên").max(255),
  email: z.string().trim().email("Email không hợp lệ").max(255).nullish().or(z.literal("")),
  password: z.string().min(8, PASSWORD_RULE).max(128),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, "Nhập mật khẩu").max(128),
});

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderLookupSchema = z.object({ phone: phone.optional() });

export const payOrderSchema = z.object({ returnUrl: z.string().url().max(1000) });

export const cancelOrderSchema = z.object({ reason: z.string().trim().max(500).nullish() });
