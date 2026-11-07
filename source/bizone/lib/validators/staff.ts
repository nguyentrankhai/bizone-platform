import { z } from "zod";

const id = z.number().int().positive();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM");
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:MM");

// ─── Staff ────────────────────────────────────────────────────────────────────

export const roleAssignmentSchema = z.object({ roleId: id, branchId: id });

export const listStaffSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  roleId: id.optional(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type ListStaffInput = z.infer<typeof listStaffSchema>;

export const createStaffSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Tên đăng nhập tối thiểu 3 ký tự")
    .max(100)
    .regex(/^[a-z0-9._@-]+$/, "Tên đăng nhập chỉ gồm chữ thường, số và . _ @ -"),
  fullName: z.string().trim().min(1, "Họ tên bắt buộc").max(255),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(255).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+ ]{7,20}$/, "Số điện thoại không hợp lệ")
    .optional(),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128),
  temporaryPassword: z.boolean().default(true),
  roles: z.array(roleAssignmentSchema).min(1, "Chọn ít nhất một vai trò").max(50),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  id,
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(255).nullable().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+ ]{7,20}$/, "Số điện thoại không hợp lệ")
    .nullable()
    .optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const setStaffRolesSchema = z.object({
  id,
  roles: z.array(roleAssignmentSchema).min(1, "Chọn ít nhất một vai trò").max(50),
});

export const setStaffActiveSchema = z.object({ id, active: z.boolean() });

export const resetPasswordSchema = z.object({
  id,
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128),
  temporary: z.boolean().default(true),
});

// ─── Roles ────────────────────────────────────────────────────────────────────

export const roleInputSchema = z.object({
  name: z.string().trim().min(1, "Tên vai trò bắt buộc").max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().max(100)).max(200),
});
export const updateRoleSchema = roleInputSchema.extend({ id });

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shiftInputSchema = z.object({
  name: z.string().trim().min(1, "Tên ca bắt buộc").max(100),
  startTime: timeOfDay,
  endTime: timeOfDay,
  branchId: id.nullable().optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
export const updateShiftSchema = shiftInputSchema.partial().extend({ id });

export const assignShiftSchema = z.object({
  shiftId: id,
  userIds: z.array(id).min(1).max(100),
  dates: z.array(dateKey).min(1).max(62),
  notes: z.string().trim().max(500).optional(),
});
export type AssignShiftInput = z.infer<typeof assignShiftSchema>;

export const calendarSchema = z.object({
  from: dateKey,
  to: dateKey,
  branchId: id.optional(),
});

// ─── Attendance ───────────────────────────────────────────────────────────────

export const timesheetSchema = z.object({
  from: dateKey,
  to: dateKey,
  userId: id.optional(),
});

export const attendanceNoteSchema = z.object({ notes: z.string().trim().max(500).optional() });

// ─── Commissions ──────────────────────────────────────────────────────────────

const commissionRuleBase = z.object({
  name: z.string().trim().min(1, "Tên quy tắc bắt buộc").max(255),
  type: z.enum(["percent_revenue", "percent_profit", "fixed_per_product"]),
  value: z.number().positive("Giá trị phải > 0").max(1_000_000_000),
  productId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  minRevenue: z.number().min(0).nullable().optional(),
  isActive: z.boolean().default(true),
});

function checkRule(r: { type?: string; value?: number }, ctx: z.RefinementCtx) {
  if (r.type && r.type !== "fixed_per_product" && r.value !== undefined && r.value > 100) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Tỷ lệ % phải ≤ 100" });
  }
}

export const commissionRuleSchema = commissionRuleBase.superRefine(checkRule);
export const updateCommissionRuleSchema = commissionRuleBase
  .partial()
  .extend({ id })
  .superRefine(checkRule);
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;

export const listCommissionsSchema = z.object({
  month: monthKey,
  userId: id.optional(),
  status: z.enum(["pending", "paid", "cancelled"]).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(50),
});

export const monthSchema = z.object({ month: monthKey, userId: id.optional() });

export const payCommissionsSchema = z
  .object({
    ids: z.array(id).max(500).optional(),
    userId: id.optional(),
    month: monthKey.optional(),
  })
  .refine((v) => (v.ids && v.ids.length > 0) || (v.userId && v.month), {
    message: "Chọn hoa hồng cần thanh toán (ids) hoặc nhân viên + tháng",
  });

export const salesSchema = z.object({
  from: dateKey,
  to: dateKey,
  userId: id.optional(),
});
