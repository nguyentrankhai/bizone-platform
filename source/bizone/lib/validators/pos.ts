import { z } from "zod";

export const PAYMENT_METHODS = ["cash", "transfer", "card", "wallet", "qr"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const money = z.number().nonnegative().max(1e13);
const qty = z.number().positive().max(1e6);

// ─── Cash session ─────────────────────────────────────────────────────────────

export const openSessionSchema = z.object({
  branchId: z.number().int().positive(),
  openingBalance: money.default(0),
});

export const closeSessionSchema = z.object({
  sessionId: z.number().int().positive(),
  actualClosingBalance: money,
  notes: z.string().max(2000).nullable().optional(),
});

export const listSessionsSchema = z.object({
  branchId: z.number().int().positive().optional(),
  status: z.enum(["open", "closed"]).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

// ─── Invoice ─────────────────────────────────────────────────────────────────

export const invoiceItemInputSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: qty,
  discountPercent: z.number().min(0).max(100).default(0),
});

export const paymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: money.positive(),
  referenceCode: z.string().max(255).nullable().optional(),
});

export const createInvoiceSchema = z.object({
  cashSessionId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  items: z.array(invoiceItemInputSchema).min(1, "Hóa đơn phải có ít nhất 1 sản phẩm").max(500),
  payments: z.array(paymentInputSchema).min(1, "Chưa chọn phương thức thanh toán").max(10),
  couponCode: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Client-generated key (UUID) so a retried request never creates a second invoice */
  idempotencyKey: z.string().min(8).max(100),
});

export const quoteSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  items: z.array(invoiceItemInputSchema).max(500),
  couponCode: z.string().trim().max(100).nullable().optional(),
});

export const listInvoicesSchema = z.object({
  cashSessionId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  status: z.enum(["active", "refunded", "cancelled"]).optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const cancelInvoiceSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().max(2000).nullable().optional(),
});

export const refundInvoiceSchema = z.object({
  id: z.number().int().positive(),
  items: z
    .array(
      z.object({
        invoiceItemId: z.number().int().positive(),
        quantity: qty,
        reason: z.string().max(2000).nullable().optional(),
      }),
    )
    .min(1),
  reason: z.string().max(2000).nullable().optional(),
  /** How the money goes back to the customer; cash refunds reduce the drawer */
  refundMethod: z.enum(PAYMENT_METHODS).default("cash"),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;
export type RefundInvoiceInput = z.infer<typeof refundInvoiceSchema>;
