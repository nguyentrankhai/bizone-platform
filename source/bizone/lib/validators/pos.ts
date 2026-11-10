import { z } from "zod";

export const PAYMENT_METHODS = ["cash", "transfer", "card", "wallet", "qr"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/**
 * Credit lines the server adds itself (never accepted from clients): `exchange` = value of the
 * goods returned in an exchange, `deposit` = pre-order deposit applied when the goods are handed over.
 */
export const CREDIT_METHODS = ["exchange", "deposit"] as const;
export type CreditMethod = (typeof CREDIT_METHODS)[number];
/** Payment Hub methods available at the POS (P4.5) */
export const PAYHUB_METHODS = ["qr", "card"] as const;
export type PayhubMethod = (typeof PAYHUB_METHODS)[number];

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
  /** Paid Payment Hub intent (method qr/card) — verified and consumed server-side */
  intentId: z.number().int().positive().optional(),
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
  /** P4.6: defaults to the branch the user works on */
  branchId: z.number().int().positive().optional(),
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

// ─── Exchange (đổi hàng) ─────────────────────────────────────────────────────

const returnItemsSchema = z
  .array(
    z.object({
      invoiceItemId: z.number().int().positive(),
      quantity: qty,
      reason: z.string().max(2000).nullable().optional(),
    }),
  )
  .min(1, "Chọn ít nhất 1 sản phẩm trả");

export const exchangeQuoteSchema = z.object({
  invoiceId: z.number().int().positive(),
  returnItems: returnItemsSchema,
  newItems: z.array(invoiceItemInputSchema).max(500).default([]),
  customerId: z.number().int().positive().nullable().optional(),
  couponCode: z.string().trim().max(100).nullable().optional(),
});

export const exchangeSchema = exchangeQuoteSchema.extend({
  newItems: z.array(invoiceItemInputSchema).min(1, "Chọn sản phẩm đổi").max(500),
  /** Customer pays the difference (new goods worth more than the returned ones) */
  payments: z.array(paymentInputSchema).max(10).default([]),
  /** How the remainder goes back when the returned goods are worth more */
  refundMethod: z.enum(PAYMENT_METHODS).default("cash"),
  reason: z.string().max(2000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

// ─── Pre-order (đặt trước + cọc) ──────────────────────────────────────────────

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hẹn giao không hợp lệ (YYYY-MM-DD)");

export const createPreorderSchema = z.object({
  cashSessionId: z.number().int().positive(),
  customerId: z
    .number({ error: "Đơn đặt trước cần khách hàng" })
    .int()
    .positive({ error: "Đơn đặt trước cần khách hàng" }),
  items: z.array(invoiceItemInputSchema).min(1, "Đơn đặt trước phải có sản phẩm").max(500),
  couponCode: z.string().trim().max(100).nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  deposit: paymentInputSchema,
  /** Clear the session cart afterwards (pre-order created from the POS cart) */
  fromCart: z.boolean().default(true),
  idempotencyKey: z.string().min(8).max(100),
});

export const listPreordersSchema = z.object({
  branchId: z.number().int().positive().optional(),
  status: z.enum(["pending", "completed", "cancelled"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const completePreorderSchema = z.object({
  id: z.number().int().positive(),
  cashSessionId: z.number().int().positive(),
  /** Remaining amount after the deposit (empty when the deposit covers everything) */
  payments: z.array(paymentInputSchema).max(10).default([]),
  /** Deposit larger than the final total → how the excess goes back */
  refundMethod: z.enum(PAYMENT_METHODS).default("cash"),
  idempotencyKey: z.string().min(8).max(100),
});

export const cancelPreorderSchema = z.object({
  id: z.number().int().positive(),
  /** Deposit returned to the customer (default: all of it; 0 = deposit kept) */
  refundAmount: money.optional(),
  refundMethod: z.enum(PAYMENT_METHODS).default("cash"),
  reason: z.string().max(2000).nullable().optional(),
});

// ─── Payment Hub (card / QR) ─────────────────────────────────────────────────

export const createPayhubIntentSchema = z.object({
  cashSessionId: z.number().int().positive(),
  method: z.enum(PAYHUB_METHODS),
  amount: money.positive().int("Số tiền phải là số nguyên (đồng)"),
});

// ─── Display pairing ─────────────────────────────────────────────────────────

export const pairDisplaySchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Mã PIN gồm 6 chữ số"),
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
export type ExchangeQuoteInput = z.infer<typeof exchangeQuoteSchema>;
export type ExchangeInput = z.infer<typeof exchangeSchema>;
export type CreatePreorderInput = z.infer<typeof createPreorderSchema>;
export type ListPreordersInput = z.infer<typeof listPreordersSchema>;
export type CompletePreorderInput = z.infer<typeof completePreorderSchema>;
export type CancelPreorderInput = z.infer<typeof cancelPreorderSchema>;
export type CreatePayhubIntentInput = z.infer<typeof createPayhubIntentSchema>;
