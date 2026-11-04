import { z } from "zod";

export const listOrdersSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  search: z.string().optional(), // order code, customer name/phone
  channel: z.string().optional(),
  status: z
    .enum([
      "pending",
      "confirmed",
      "preparing",
      "shipping",
      "delivered",
      "completed",
      "cancelled",
      "returned",
    ])
    .optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  dateFrom: z.string().optional(), // ISO date
  dateTo: z.string().optional(),
  branchId: z.number().int().positive().optional(),
  createdBy: z.number().int().positive().optional(),
});

export const createOrderSchema = z.object({
  customerId: z.number().int().positive().optional(),
  channel: z.string().max(50).default("pos"),
  channelOrderId: z.string().max(100).optional(),
  branchId: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        discountAmount: z.number().nonnegative().default(0),
      }),
    )
    .min(1),
  shippingFee: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  paymentMethod: z.string().max(50).optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  shippingAddress: z.string().optional(),
  shippingProvider: z.string().max(100).optional(),
  trackingCode: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "confirmed",
    "preparing",
    "shipping",
    "delivered",
    "completed",
    "cancelled",
    "returned",
  ]),
  note: z.string().optional(),
  trackingCode: z.string().max(100).optional(),
  shippingProvider: z.string().max(100).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1, "Lý do huỷ là bắt buộc"),
});

export const createRefundSchema = z.object({
  reason: z.string().min(1, "Lý do hoàn trả là bắt buộc"),
  items: z
    .array(
      z.object({
        orderItemId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        refundAmount: z.number().nonnegative(),
        reason: z.string().optional(),
      }),
    )
    .min(1),
});

export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
