import { keycloakRoleOf } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { eventDef, isEventType, type NotificationEventDef } from "@/lib/notifications/events";
import { emailHtml, fmtVnd, renderTemplate, type TemplateVars } from "@/lib/notifications/template";
import type { ListDeliveriesInput } from "@/lib/validators/notification";
import { activeBranchRows, computeBranchScope } from "@/server/middleware/branchScope";
import { getStaffAccess } from "@/server/services/rbac.service";
import { sendEmail, type EmailMessage } from "@/server/services/email.service";
import { sendSms } from "@/server/services/sms.service";
import { sendPush } from "@/server/services/push.service";
import { appUrl, getEventSettings, storeName } from "@/server/services/notification.service";
import type { AuthUser } from "@/types/auth";

/**
 * Sending side of notifications: renders templates, sends email / SMS / Web Push and records
 * every message in `notification_deliveries`. Runs in the worker for events and campaigns, and
 * in the app for "Gửi thử" (template test).
 */

export interface PlannedMessage {
  channel: "email" | "sms";
  recipient: string;
  templateCode: string | null;
  subject: string | null;
  text: string;
  customerId?: number | null;
}

/** Template text by code (active only); null when missing → caller falls back */
export async function loadTemplate(code: string | null | undefined) {
  if (!code) return null;
  const t = await getPrisma().notificationTemplate.findUnique({ where: { templateCode: code } });
  return t && t.isActive ? t : null;
}

const FALLBACK = {
  email: { subject: "[{{store_name}}] {{title}}", content: "{{content}}\n\n{{link}}" },
  sms: { subject: null, content: "{{store_name}}: {{title}}. {{content}}" },
};

/** Render a template (or the built-in fallback) for one channel */
export async function renderFor(
  channel: "email" | "sms",
  templateCode: string | null,
  vars: TemplateVars,
): Promise<{ templateCode: string | null; subject: string | null; text: string }> {
  const t = await loadTemplate(templateCode);
  const src = t ?? FALLBACK[channel];
  return {
    templateCode: t ? t.templateCode : null,
    subject: src.subject ? renderTemplate(src.subject, vars).slice(0, 500) : null,
    text: renderTemplate(src.content, vars).trim(),
  };
}

type DeliveryRef = {
  notificationId?: bigint | null;
  campaignId?: number | null;
  eventType: string;
};

/**
 * Send one message and log it. An existing delivery row (retry) is reused; a row already `sent`
 * is not sent again. Returns the final status.
 */
export async function deliverOne(
  ref: DeliveryRef,
  msg: PlannedMessage,
  extra?: { attachments?: EmailMessage["attachments"]; store?: string; existingId?: bigint },
): Promise<{ id: bigint; status: "sent" | "failed"; error?: string; provider?: string }> {
  const prisma = getPrisma();
  const row = extra?.existingId
    ? await prisma.notificationDelivery.update({
        where: { id: extra.existingId },
        data: { status: "pending" },
      })
    : await prisma.notificationDelivery.create({
        data: {
          notificationId: ref.notificationId ?? null,
          campaignId: ref.campaignId ?? null,
          customerId: msg.customerId ?? null,
          eventType: ref.eventType,
          channel: msg.channel,
          recipient: msg.recipient.slice(0, 1000),
          templateCode: msg.templateCode,
          subject: msg.subject,
          content: msg.text,
          status: "pending",
        },
      });
  try {
    let provider: string;
    let messageId: string | null;
    let content = msg.text;
    if (msg.channel === "email") {
      const res = await sendEmail({
        to: [msg.recipient],
        subject: msg.subject ?? "(không tiêu đề)",
        text: msg.text,
        html: emailHtml(msg.text, extra?.store ?? (await storeName())),
        attachments: extra?.attachments,
      });
      provider = res.provider;
      messageId = res.messageId;
    } else {
      const res = await sendSms(msg.recipient, msg.text);
      provider = res.provider;
      messageId = res.messageId;
      content = res.text; // what was actually sent (accents stripped)
    }
    await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: {
        status: "sent",
        provider,
        providerMessageId: messageId?.slice(0, 255) ?? null,
        content,
        error: null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
    return { id: row.id, status: "sent", provider };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: { status: "failed", error, attempts: { increment: 1 } },
    });
    return { id: row.id, status: "failed", error };
  }
}

// ─── Event delivery (worker job "deliver") ──────────────────────────────────

/** Common variables of every notification template */
export async function baseVars(n: {
  title: string;
  content: string | null;
  link: string | null;
  createdAt: Date;
}): Promise<TemplateVars> {
  return {
    store_name: await storeName(),
    title: n.title,
    content: n.content ?? "",
    link: n.link ? appUrl(n.link) : "",
    created_at: n.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  };
}

const CUSTOMER_TEMPLATES: Record<string, string> = {
  customer_debt_overdue: "debt_reminder_sms",
  preorder_due: "preorder_due_sms",
};

/** Email / SMS messages one notification should produce under the current settings */
export async function planMessages(notificationId: bigint): Promise<{
  type: string;
  messages: PlannedMessage[];
  push: boolean;
} | null> {
  const prisma = getPrisma();
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || !isEventType(n.type)) return null;
  const settings = await getEventSettings(n.type);
  const data = (n.data ? JSON.parse(n.data) : {}) as TemplateVars;
  const vars: TemplateVars = { ...data, ...(await baseVars(n)) };

  let emails: string[] = [];
  let phones: string[] = [];
  if (n.userId !== null) {
    const u = await prisma.user.findUnique({
      where: { id: n.userId },
      select: { email: true, phone: true, isActive: true },
    });
    if (u?.isActive) {
      emails = u.email ? [u.email] : [];
      phones = u.phone ? [u.phone] : [];
    }
  } else {
    emails = settings.emailTo;
    phones = settings.smsTo;
  }

  const messages: PlannedMessage[] = [];
  // report_scheduled emails carry the report file → sent by the report job (reportMail.service)
  if (settings.email && emails.length && n.type !== "report_scheduled") {
    const r = await renderFor("email", settings.emailTemplate, vars);
    for (const to of emails) messages.push({ channel: "email", recipient: to, ...r });
  }
  if (settings.sms && phones.length) {
    const r = await renderFor("sms", settings.smsTemplate, vars);
    for (const to of phones) messages.push({ channel: "sms", recipient: to, ...r });
  }
  // Customer-facing reminder (debt / pre-order) when the store enabled it
  const customerTemplate = CUSTOMER_TEMPLATES[n.type];
  const customerPhone = typeof data.customer_phone === "string" ? data.customer_phone : null;
  if (
    settings.sms &&
    customerTemplate &&
    settings.options.remindCustomer === true &&
    customerPhone
  ) {
    const r = await renderFor("sms", customerTemplate, vars);
    messages.push({
      channel: "sms",
      recipient: customerPhone,
      ...r,
      customerId: typeof data.customer_id === "number" ? data.customer_id : null,
    });
  }
  return { type: n.type, messages, push: settings.push };
}

export async function deliverNotification(notificationId: bigint) {
  const prisma = getPrisma();
  const plan = await planMessages(notificationId);
  if (!plan) return { sent: 0, failed: 0, push: 0 };
  const existing = await prisma.notificationDelivery.findMany({
    where: { notificationId, channel: { in: ["email", "sms"] } },
  });
  const store = await storeName();
  let sent = 0;
  let failed = 0;
  for (const msg of plan.messages) {
    const prev = existing.find(
      (d) =>
        d.channel === msg.channel &&
        d.recipient === msg.recipient &&
        d.templateCode === msg.templateCode,
    );
    if (prev?.status === "sent") continue; // retry of a partly sent job
    const res = await deliverOne({ notificationId, eventType: plan.type }, msg, {
      store,
      existingId: prev?.id,
    });
    if (res.status === "sent") sent++;
    else failed++;
  }
  const push = plan.push ? await pushNotification(notificationId) : 0;
  if (failed > 0) throw new Error(`${failed}/${plan.messages.length} tin gửi lỗi — sẽ thử lại`);
  return { sent, failed, push };
}

// ─── Web Push ────────────────────────────────────────────────────────────────

/**
 * Subscription owner as an AuthUser for permission checks. QA-3 (#99): system roles come from
 * the staff profile when the Staff module manages the user (`user_roles` ⇔ Keycloak realm roles,
 * so a demotion applies at once); the roles saved at subscribe time are only the fallback for
 * accounts without a staff role row.
 */
function subscriber(sub: { username: string; roles: string }, dbRoles?: string[]): AuthUser {
  return {
    id: sub.username,
    username: sub.username,
    tenantId: "",
    roles: dbRoles ?? (sub.roles ? sub.roles.split(",") : []),
    resourceRoles: {},
    expiresAt: 0,
  };
}

/** userId → realm roles of their system roles (only users that have role rows) */
async function systemRolesByUser(userIds: number[]): Promise<Map<number, string[]>> {
  const rows = await getPrisma().userRole.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, role: { select: { code: true } } },
  });
  const out = new Map<number, string[]>();
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    const kc = keycloakRoleOf(r.role.code);
    if (kc && !list.includes(kc)) list.push(kc);
    out.set(r.userId, list);
  }
  return out;
}

export async function pushNotification(notificationId: bigint): Promise<number> {
  const prisma = getPrisma();
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n) return 0;
  const def = eventDef(n.type) as NotificationEventDef | null;
  if (!def) return 0;
  const already = await prisma.notificationDelivery.findMany({
    where: { notificationId, channel: "push", status: "sent" },
    select: { recipient: true },
  });
  const done = new Set(already.map((d) => d.recipient));
  const subs = await prisma.pushSubscription.findMany({
    where: n.userId !== null ? { userId: n.userId } : {},
    include: { user: { select: { isActive: true } } },
  });
  const muted = new Set(
    (
      await prisma.notificationPreference.findMany({
        where: { eventType: n.type, push: false },
        select: { userId: true },
      })
    ).map((p) => p.userId),
  );
  const branches = await activeBranchRows();
  const dbRoles = await systemRolesByUser([...new Set(subs.map((s) => s.userId))]);
  let sent = 0;
  for (const sub of subs) {
    const recipient = `push:${sub.id}`;
    if (done.has(recipient) || !sub.user.isActive || muted.has(sub.userId)) continue;
    if (n.userId === null) {
      const user = subscriber(sub, dbRoles.get(sub.userId));
      const access = await getStaffAccess(user);
      if (!access.active || !n.audience) continue;
      if (!hasPermission(user, n.audience as never, access.capabilities)) continue;
      if (n.branchId !== null) {
        const scope = computeBranchScope(user, access, null, branches);
        if (!scope.canAll && !scope.allowed.includes(n.branchId)) continue;
      }
    }
    const res = await sendPush(sub, {
      title: n.title,
      body: n.content ?? "",
      link: n.link,
      tag: `bizone-${n.id}`,
    });
    await prisma.notificationDelivery.create({
      data: {
        notificationId,
        eventType: n.type,
        channel: "push",
        recipient,
        subject: `${sub.username} — ${sub.userAgent?.slice(0, 120) ?? "trình duyệt"}`,
        content: n.title,
        status: res.ok ? "sent" : "failed",
        provider: "webpush",
        error: res.ok ? null : res.error.slice(0, 1000),
        attempts: 1,
        sentAt: res.ok ? new Date() : null,
      },
    });
    if (res.ok) {
      sent++;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSuccessAt: new Date(), failureCount: 0 },
      });
    } else if (res.gone || sub.failureCount >= 9) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    } else {
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { failureCount: { increment: 1 } },
      });
    }
  }
  return sent;
}

// ─── Delivery log ────────────────────────────────────────────────────────────

export async function listDeliveries(input: ListDeliveriesInput) {
  const prisma = getPrisma();
  const where: Prisma.NotificationDeliveryWhereInput = {
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.eventType ? { eventType: input.eventType } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.search
      ? {
          OR: [{ recipient: { contains: input.search } }, { subject: { contains: input.search } }],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.notificationDelivery.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      ...r,
      id: r.id.toString(),
      notificationId: r.notificationId?.toString() ?? null,
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export { fmtVnd };
