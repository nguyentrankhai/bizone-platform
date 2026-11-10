import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { COMMON_VARIABLES, NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import {
  normalizePhone,
  renderTemplate,
  templateVariables,
  VN_PHONE,
} from "@/lib/notifications/template";
import type {
  CreateTemplateInput,
  SendTestInput,
  UpdateTemplateInput,
} from "@/lib/validators/notification";
import { deliverOne } from "@/server/services/notificationDelivery.service";
import { appUrl, storeName } from "@/server/services/notification.service";

/** Notification templates CRUD (API-Design §14 /config/notification-templates) + preview / test */

export async function listTemplates(channel?: "email" | "sms") {
  const prisma = getPrisma();
  const [rows, settings] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where: channel ? { channel } : {},
      orderBy: [{ channel: "asc" }, { templateCode: "asc" }],
    }),
    prisma.notificationSetting.findMany({
      select: { eventType: true, emailTemplate: true, smsTemplate: true },
    }),
  ]);
  const used = templateUsage(settings);
  return rows.map((t) => ({ ...t, usedBy: used.get(t.templateCode) ?? [] }));
}

/** template code → event labels that send with it (store settings, else catalog defaults) */
function templateUsage(
  settings: { eventType: string; emailTemplate: string | null; smsTemplate: string | null }[],
) {
  const byType = new Map(settings.map((s) => [s.eventType, s]));
  const used = new Map<string, string[]>();
  for (const [type, def] of Object.entries(NOTIFICATION_EVENTS)) {
    const s = byType.get(type);
    for (const code of [
      s ? s.emailTemplate : def.emailTemplate,
      s ? s.smsTemplate : def.smsTemplate,
    ]) {
      if (code) used.set(code, [...(used.get(code) ?? []), def.label]);
    }
  }
  used.set("debt_reminder_sms", [...(used.get("debt_reminder_sms") ?? []), "Nhắc nợ khách hàng"]);
  used.set("preorder_due_sms", [...(used.get("preorder_due_sms") ?? []), "Nhắc khách nhận đơn"]);
  return used;
}

export async function getTemplate(id: number) {
  const t = await getPrisma().notificationTemplate.findUnique({ where: { id } });
  if (!t) throw bizoneError("NOT_FOUND", `Mẫu thông báo #${id} không tồn tại`);
  return t;
}

const variablesOf = (subject: string | null, content: string) =>
  templateVariables(`${subject ?? ""}\n${content}`).join(",") || null;

export async function createTemplate(input: CreateTemplateInput) {
  const prisma = getPrisma();
  const dup = await prisma.notificationTemplate.findUnique({
    where: { templateCode: input.templateCode },
  });
  if (dup) throw bizoneError("CONFLICT", `Mã mẫu "${input.templateCode}" đã tồn tại`);
  return prisma.notificationTemplate.create({
    data: {
      templateCode: input.templateCode,
      templateName: input.templateName,
      channel: input.channel,
      subject: input.channel === "email" ? input.subject : null,
      content: input.content,
      variables: variablesOf(input.subject, input.content),
      isActive: input.isActive,
    },
  });
}

export async function updateTemplate(input: UpdateTemplateInput) {
  const current = await getTemplate(input.id);
  if (current.channel !== input.channel) {
    const users = await settingsUsing(current.templateCode);
    if (users.length)
      throw bizoneError(
        "CONFLICT",
        `Mẫu đang dùng cho "${users.join(", ")}" — không đổi kênh được`,
      );
  }
  return getPrisma().notificationTemplate.update({
    where: { id: input.id },
    data: {
      templateName: input.templateName,
      channel: input.channel,
      subject: input.channel === "email" ? input.subject : null,
      content: input.content,
      variables: variablesOf(input.subject, input.content),
      isActive: input.isActive,
    },
  });
}

async function settingsUsing(code: string): Promise<string[]> {
  const rows = await getPrisma().notificationSetting.findMany({
    where: { OR: [{ emailTemplate: code }, { smsTemplate: code }] },
    select: { eventType: true },
  });
  return rows.map(
    (r) =>
      (NOTIFICATION_EVENTS as Record<string, { label: string }>)[r.eventType]?.label ?? r.eventType,
  );
}

export async function deleteTemplate(id: number) {
  const t = await getTemplate(id);
  const users = await settingsUsing(t.templateCode);
  if (users.length)
    throw bizoneError(
      "CONFLICT",
      `Mẫu đang dùng cho "${users.join(", ")}" — đổi mẫu trước khi xoá`,
    );
  const builtIn = Object.values(NOTIFICATION_EVENTS).some(
    (d) => d.emailTemplate === t.templateCode || d.smsTemplate === t.templateCode,
  );
  if (builtIn || ["debt_reminder_sms", "preorder_due_sms"].includes(t.templateCode))
    throw bizoneError("CONFLICT", "Mẫu mặc định của hệ thống — có thể sửa hoặc tắt, không xoá");
  await getPrisma().notificationTemplate.delete({ where: { id } });
  return { id };
}

/** Example values for every known variable (preview / test) */
export async function sampleVars(): Promise<Record<string, string>> {
  return {
    store_name: await storeName(),
    title: "Đơn hàng mới DH2611100001 từ Shopee",
    content: "Khách Nguyễn Văn A — 850.000₫",
    link: appUrl("/orders"),
    created_at: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    order_code: "DH2611100001",
    channel: "Shopee",
    customer_name: "Nguyễn Văn A",
    customer_phone: "0901234567",
    total_amount: "850.000₫",
    branch_name: "Chi nhánh Hà Nội",
    product_name: "Áo thun nam",
    sku: "AT-001",
    warehouse_name: "Kho Hà Nội",
    quantity: "2",
    min_stock: "10",
    stock_take_code: "KK2611100001",
    diff_count: "5",
    surplus: "2",
    shortage: "3",
    remaining_amount: "2.500.000₫",
    due_date: "10/11/2026",
    days_overdue: "30",
    days_left: "3",
    supplier_name: "Công ty May Việt",
    po_code: "PN2611100001",
    preorder_code: "DC2611100001",
    shift_name: "Ca sáng",
    start_time: "08:00",
    end_time: "12:00",
    date: "10/11/2026",
    report_name: "Doanh thu",
    period: "03/11/2026 – 09/11/2026",
    net_revenue: "125.000.000₫",
    invoice_count: "312",
    profit: "38.500.000₫",
    campaign_name: "Tri ân khách VIP",
    sent: "95",
    failed: "5",
    total: "100",
    invoice_code: "HD2611100001",
    points: "1.250",
    ranking: "Gold",
    error: "Token hết hạn",
  };
}

export async function previewTemplate(input: {
  subject: string | null;
  content: string;
  vars?: Record<string, string>;
}) {
  const vars = { ...(await sampleVars()), ...(input.vars ?? {}) };
  const used = templateVariables(`${input.subject ?? ""}\n${input.content}`);
  const known = new Set([...Object.keys(vars), ...COMMON_VARIABLES]);
  return {
    subject: input.subject ? renderTemplate(input.subject, vars) : null,
    content: renderTemplate(input.content, vars),
    variables: used,
    unknown: used.filter((v) => !known.has(v)),
  };
}

/** Render with sample values (+ overrides) and send to one address — logged as event "test" */
export async function sendTestTemplate(input: SendTestInput) {
  const t = await getTemplate(input.id);
  let to = input.to.trim();
  if (t.channel === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      throw bizoneError("VALIDATION_ERROR", "Email nhận không hợp lệ");
  } else {
    to = normalizePhone(to);
    if (!VN_PHONE.test(to)) throw bizoneError("VALIDATION_ERROR", "Số điện thoại không hợp lệ");
  }
  const vars = { ...(await sampleVars()), ...(input.vars ?? {}) };
  const res = await deliverOne(
    { eventType: "test" },
    {
      channel: t.channel as "email" | "sms",
      recipient: to,
      templateCode: t.templateCode,
      subject: t.subject ? renderTemplate(t.subject, vars) : null,
      text: renderTemplate(t.content, vars).trim(),
    },
  );
  if (res.status === "failed")
    throw bizoneError("SERVICE_UNAVAILABLE", `Gửi thử thất bại: ${res.error ?? "lỗi không rõ"}`);
  return { deliveryId: res.id.toString(), provider: res.provider ?? null };
}
