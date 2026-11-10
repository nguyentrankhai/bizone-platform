import { z } from "zod";

export const listCustomersSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  groupId: z.number().int().positive().optional(),
  ranking: z.enum(["silver", "gold", "vip", "diamond"]).optional(),
  isActive: z.boolean().optional(),
});
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

export const createCustomerSchema = z.object({
  fullName: z.string().min(1).max(255),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthday: z.string().optional(),
  groupId: z.number().int().positive().optional(),
  notes: z.string().optional(),
  debtLimit: z.number().min(0).default(0),
  address: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().min(7).max(20).optional(),
  email: z.string().email().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthday: z.string().optional(),
  groupId: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
  debtLimit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const adjustPointsSchema = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, "Điểm không được bằng 0"),
  type: z.enum(["earn", "redeem", "adjust"]),
  notes: z.string().optional(),
});
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;

export const createDebtSchema = z.object({
  totalAmount: z.number().positive(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  invoiceId: z.number().int().positive().optional(),
});
export type CreateDebtInput = z.infer<typeof createDebtSchema>;

export const payDebtSchema = z.object({
  debtId: z.number().int().positive(),
  amount: z.number().positive(),
  notes: z.string().optional(),
  /** P4.8: quỹ nhận tiền (phiếu thu "Thu nợ khách hàng" luôn được ghi; có quỹ thì quỹ tăng) */
  fundId: z.number().int().positive().optional(),
});
export type PayDebtInput = z.infer<typeof payDebtSchema>;

export const mergeCustomersSchema = z.object({
  keepId: z.number().int().positive(),
  mergeId: z.number().int().positive(),
});
export type MergeCustomersInput = z.infer<typeof mergeCustomersSchema>;
