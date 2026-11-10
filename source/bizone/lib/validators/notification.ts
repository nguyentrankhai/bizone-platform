import { z } from "zod";
import { EVENT_TYPES } from "@/lib/notifications/events";
import { VN_PHONE, normalizePhone } from "@/lib/notifications/template";

const eventType = z.enum(EVENT_TYPES as [string, ...string[]], {
  message: "Loại thông báo không hợp lệ",
});
const notificationId = z.string().regex(/^\d{1,19}$/, "Mã thông báo không hợp lệ");
const phone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((p) => VN_PHONE.test(p), "Số điện thoại không hợp lệ (VD 0901234567)");
const email = z.string().trim().toLowerCase().email("Email không hợp lệ").max(255);
const templateCode = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{3,100}$/, "Mã mẫu chỉ gồm chữ thường, số, dấu _ (3–100 ký tự)");

// ─── Notification center (self) ───────────────────────────────────────────────

export const listNotificationsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  unreadOnly: z.boolean().default(false),
  type: eventType.optional(),
});
export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;

export const notificationIdsSchema = z.object({
  ids: z.array(notificationId).min(1).max(100),
});

export const preferencesSchema = z.object({
  items: z
    .array(z.object({ eventType, inApp: z.boolean(), push: z.boolean() }))
    .min(1)
    .max(50),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const pushSubscribeSchema = z.object({
  endpoint: z
    .url("Endpoint không hợp lệ")
    .max(1000)
    .startsWith("https://", "Endpoint phải là https"),
  keys: z.object({ p256dh: z.string().min(10).max(255), auth: z.string().min(8).max(255) }),
  userAgent: z.string().max(255).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

// ─── Store settings ───────────────────────────────────────────────────────────

export const updateSettingSchema = z.object({
  eventType,
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  push: z.boolean(),
  emailTo: z.array(email).max(10, "Tối đa 10 email"),
  smsTo: z.array(phone).max(10, "Tối đa 10 số điện thoại"),
  emailTemplate: templateCode.nullable(),
  smsTemplate: templateCode.nullable(),
  options: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

// ─── Templates ────────────────────────────────────────────────────────────────

const templateBody = z.object({
  templateName: z.string().trim().min(1, "Nhập tên mẫu").max(255),
  channel: z.enum(["email", "sms"], { message: "Kênh phải là email hoặc sms" }),
  subject: z.string().trim().max(500).nullable().default(null),
  content: z.string().trim().min(1, "Nhập nội dung").max(5000),
  isActive: z.boolean().default(true),
});

function checkTemplate(
  t: { channel: string; subject: string | null; content: string },
  ctx: z.RefinementCtx,
) {
  if (t.channel === "email" && !t.subject)
    ctx.addIssue({ code: "custom", message: "Mẫu email cần tiêu đề", path: ["subject"] });
  if (t.channel === "sms" && t.content.length > 640)
    ctx.addIssue({ code: "custom", message: "SMS tối đa 640 ký tự (4 tin)", path: ["content"] });
}

export const createTemplateSchema = templateBody
  .extend({ templateCode })
  .superRefine(checkTemplate);
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = templateBody
  .extend({ id: z.number().int().positive() })
  .superRefine(checkTemplate);
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const sendTestSchema = z.object({
  id: z.number().int().positive(),
  /** Email address (email template) or phone number (SMS template) */
  to: z.string().trim().min(3).max(255),
  vars: z.record(z.string(), z.string().max(500)).optional(),
});
export type SendTestInput = z.infer<typeof sendTestSchema>;

export const listDeliveriesSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(30),
  channel: z.enum(["email", "sms", "push"]).optional(),
  status: z.enum(["pending", "sent", "failed", "skipped"]).optional(),
  eventType: z.string().max(50).optional(),
  campaignId: z.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListDeliveriesInput = z.infer<typeof listDeliveriesSchema>;

// ─── Report email (#62) ───────────────────────────────────────────────────────

export const emailListSchema = z
  .array(email)
  .min(1, "Nhập ít nhất 1 email")
  .max(5, "Tối đa 5 email");

// ─── Campaigns (#70) ─────────────────────────────────────────────────────────

export const RANKINGS = ["silver", "gold", "vip", "diamond"] as const;

export const campaignAudienceSchema = z.object({
  rankings: z.array(z.enum(RANKINGS)).max(4).default([]),
  groupIds: z.array(z.number().int().positive()).max(50).default([]),
  minSpent: z.number().min(0).max(1e12).nullable().default(null),
  birthdayMonth: z.number().int().min(1).max(12).nullable().default(null),
});
export type CampaignAudience = z.infer<typeof campaignAudienceSchema>;

const campaignBody = z.object({
  name: z.string().trim().min(1, "Nhập tên chiến dịch").max(255),
  channel: z.enum(["email", "sms"], { message: "Kênh phải là email hoặc sms" }),
  subject: z.string().trim().max(500).nullable().default(null),
  content: z.string().trim().min(1, "Nhập nội dung").max(5000),
  audience: campaignAudienceSchema,
});

export const createCampaignSchema = campaignBody.superRefine(checkTemplate);
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = campaignBody
  .extend({ id: z.number().int().positive() })
  .superRefine(checkTemplate);
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const sendCampaignSchema = z.object({
  id: z.number().int().positive(),
  /** VN wall time from datetime-local (YYYY-MM-DDTHH:mm); omitted = send now */
  scheduledAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Thời gian hẹn gửi không hợp lệ")
    .optional(),
});

export const listCampaignsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "scheduled", "sending", "completed", "cancelled"]).optional(),
});
