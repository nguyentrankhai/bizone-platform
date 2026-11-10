import { z } from "zod";

/** Keys a branch may override from store_config (P4.6) */
export const BRANCH_CONFIG_KEYS = [
  "store_name",
  "invoice_prefix",
  "bank_bin",
  "bank_name",
  "bank_account_no",
  "bank_account_name",
  "receipt_footer",
] as const;
export type BranchConfigKey = (typeof BRANCH_CONFIG_KEYS)[number];

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const branchFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã chi nhánh tối thiểu 2 ký tự")
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ, số, - và _")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Tên chi nhánh tối thiểu 2 ký tự").max(255),
  address: text(1000),
  phone: text(20),
  email: z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .max(255)
    .nullish()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  taxCode: text(50),
});

export const createBranchSchema = branchFieldsSchema.extend({
  isDefault: z.boolean().default(false),
  /** Create the branch's sales warehouse at the same time (POS sells from it) */
  createWarehouse: z.boolean().default(true),
});

export const updateBranchSchema = z.object({
  id: z.number().int().positive(),
  data: branchFieldsSchema.partial(),
});

export const setBranchConfigSchema = z.object({
  branchId: z.number().int().positive(),
  /** Empty / null = use the store-wide value */
  values: z.partialRecord(z.enum(BRANCH_CONFIG_KEYS), z.string().trim().max(500).nullable()),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type SetBranchConfigInput = z.infer<typeof setBranchConfigSchema>;
