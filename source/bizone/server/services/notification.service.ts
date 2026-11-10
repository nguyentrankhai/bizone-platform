import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { bizoneError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { currentTenantId } from "@/lib/tenant";
import {
  AUDIENCES,
  EVENT_TYPES,
  RETENTION_DAYS,
  eventDef,
  eventOptions,
  isEventType,
  notifyChannel,
  type NotificationEventType,
  type NotificationPayload,
  type NotificationSeverity,
  type NotificationViewer,
} from "@/lib/notifications/events";
import { splitList, type TemplateVars } from "@/lib/notifications/template";
import type {
  ListNotificationsInput,
  PreferencesInput,
  PushSubscribeInput,
  UpdateSettingInput,
} from "@/lib/validators/notification";
import { resolveBranchScope } from "@/server/middleware/branchScope";
import { getStaffAccess } from "@/server/services/rbac.service";
import { ensureDbUserId } from "@/server/services/user.service";
import { enqueueDelivery } from "@/server/queue/notification";
import { vapidPublicKey } from "@/server/services/push.service";
import type { AuthUser } from "@/types/auth";
import { createHash } from "node:crypto";

/**
 * Notification system (P4.7, SRS §9).
 *
 * `notify()` is the single entry point for every event: it applies the store settings of the
 * event type, stores the notification (dedupe key → at most once), publishes it on Redis
 * `bizone:notify:{tenant}` (the realtime process pushes `notification:new` to the right sockets)
 * and queues email / SMS / Web Push for the worker. It never throws: a notification must not
 * break the business operation that raised it.
 */

// ─── Settings ────────────────────────────────────────────────────────────────

export interface EventSettings {
  eventType: NotificationEventType;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  emailTo: string[];
  smsTo: string[];
  emailTemplate: string | null;
  smsTemplate: string | null;
  options: Record<string, number | string | boolean>;
  customized: boolean;
}

type SettingRow = Prisma.NotificationSettingGetPayload<object>;

function parseJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mergeSettings(type: NotificationEventType, row: SettingRow | null): EventSettings {
  const def = eventDef(type)!;
  return {
    eventType: type,
    inApp: row?.inApp ?? def.defaults.inApp,
    email: row?.email ?? def.defaults.email,
    sms: row?.sms ?? def.defaults.sms,
    push: row?.push ?? def.defaults.push,
    emailTo: splitList(row?.emailTo),
    smsTo: splitList(row?.smsTo),
    emailTemplate: row ? row.emailTemplate : def.emailTemplate,
    smsTemplate: row ? row.smsTemplate : def.smsTemplate,
    options: eventOptions(type, parseJson(row?.options)),
    customized: !!row,
  };
}

export async function getEventSettings(type: NotificationEventType): Promise<EventSettings> {
  const row = await getPrisma().notificationSetting.findUnique({ where: { eventType: type } });
  return mergeSettings(type, row);
}

export async function listSettings(): Promise<EventSettings[]> {
  const rows = await getPrisma().notificationSetting.findMany();
  const byType = new Map(rows.map((r) => [r.eventType, r]));
  return EVENT_TYPES.map((t) => mergeSettings(t, byType.get(t) ?? null));
}

export async function updateSettings(input: UpdateSettingInput, userId: number | null) {
  const type = input.eventType as NotificationEventType;
  const def = eventDef(type)!;
  const prisma = getPrisma();
  // Templates must exist, be active and match the channel
  for (const [code, channel] of [
    [input.emailTemplate, "email"],
    [input.smsTemplate, "sms"],
  ] as const) {
    if (!code) continue;
    const t = await prisma.notificationTemplate.findUnique({ where: { templateCode: code } });
    if (!t) throw bizoneError("VALIDATION_ERROR", `Mẫu "${code}" không tồn tại`);
    if (t.channel !== channel)
      throw bizoneError("VALIDATION_ERROR", `Mẫu "${code}" không phải mẫu ${channel}`);
  }
  if (input.email && !input.emailTemplate)
    throw bizoneError("VALIDATION_ERROR", "Chọn mẫu email khi bật gửi email");
  if (input.sms && !input.smsTemplate)
    throw bizoneError("VALIDATION_ERROR", "Chọn mẫu SMS khi bật gửi SMS");
  // Store-wide events need explicit recipients; personal ones go to the staff member's own contact
  if (def.audience !== null) {
    if (input.email && input.emailTo.length === 0)
      throw bizoneError("VALIDATION_ERROR", "Nhập ít nhất 1 email nhận khi bật gửi email");
    const customerSms =
      def.options.some((o) => o.key === "remindCustomer") && input.options.remindCustomer === true;
    if (input.sms && input.smsTo.length === 0 && !customerSms)
      throw bizoneError("VALIDATION_ERROR", "Nhập ít nhất 1 số điện thoại nhận khi bật gửi SMS");
  }
  const options = eventOptions(type, input.options);
  const data = {
    inApp: input.inApp,
    email: input.email,
    sms: input.sms,
    push: input.push,
    emailTo: input.emailTo.join(",") || null,
    smsTo: input.smsTo.join(",") || null,
    emailTemplate: input.emailTemplate,
    smsTemplate: input.smsTemplate,
    options: JSON.stringify(options),
    updatedBy: userId,
  };
  const row = await prisma.notificationSetting.upsert({
    where: { eventType: type },
    create: { eventType: type, ...data },
    update: data,
  });
  return mergeSettings(type, row);
}

// ─── Store info used in every template ────────────────────────────────────────

export async function storeName(): Promise<string> {
  const row = await getPrisma().storeConfig.findUnique({ where: { configKey: "store_name" } });
  return row?.configValue?.trim() || "BizOne";
}

export function appUrl(path: string | null | undefined): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}

// ─── notify ──────────────────────────────────────────────────────────────────

export interface NotifyInput {
  type: NotificationEventType;
  title: string;
  content?: string | null;
  /** App path, e.g. /orders/12 */
  link?: string | null;
  severity?: NotificationSeverity;
  /** Personal notification (shift reminder…); otherwise the event's audience */
  userId?: number | null;
  branchId?: number | null;
  /** Template variables (email / SMS) */
  vars?: TemplateVars;
  /** Same key twice → the second notify() is a no-op */
  dedupeKey?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function toPayload(n: {
  id: bigint;
  type: string;
  severity: string;
  title: string;
  content: string | null;
  link: string | null;
  audience: string | null;
  userId: number | null;
  branchId: number | null;
  createdAt: Date;
}): NotificationPayload {
  return {
    id: n.id.toString(),
    type: n.type,
    severity: n.severity as NotificationSeverity,
    title: n.title,
    content: n.content,
    link: n.link,
    audience: n.audience,
    userId: n.userId,
    branchId: n.branchId,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Raise an event. Returns the notification id, or null (disabled / duplicate / error). */
export async function notify(input: NotifyInput): Promise<bigint | null> {
  try {
    const def = eventDef(input.type);
    if (!def) return null;
    const settings = await getEventSettings(input.type);
    const external = settings.email || settings.sms || settings.push;
    if (!settings.inApp && !external) return null;

    const userId = input.userId ?? null;
    if (def.audience === null && userId === null) return null; // personal event without a target

    let row;
    try {
      row = await getPrisma().notification.create({
        data: {
          type: input.type,
          severity: input.severity ?? def.severity,
          title: input.title.slice(0, 255),
          content: input.content ?? null,
          link: input.link ?? null,
          audience: userId === null ? def.audience : null,
          userId,
          branchId: input.branchId ?? null,
          data: input.vars ? JSON.stringify(input.vars) : null,
          dedupeKey: input.dedupeKey?.slice(0, 191) ?? null,
          showInApp: settings.inApp,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null; // already notified
      throw err;
    }

    if (settings.inApp) {
      await getRedis()
        .publish(notifyChannel(currentTenantId()), JSON.stringify(toPayload(row)))
        .catch((err: Error) => console.error(`[notify] publish failed: ${err.message}`));
    }
    if (external) await enqueueDelivery(row.id);
    return row.id;
  } catch (err) {
    console.error(`[notify] ${input.type} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Viewer (who sees what) ──────────────────────────────────────────────────

export async function notificationViewer(user: AuthUser): Promise<NotificationViewer> {
  const access = await getStaffAccess(user);
  const scope = await resolveBranchScope(user, access, null);
  const userId = await ensureDbUserId(user);
  const prefs = await getPrisma().notificationPreference.findMany({
    where: { userId, inApp: false },
    select: { eventType: true },
  });
  return {
    userId,
    audiences: AUDIENCES.filter((a) => hasPermission(user, a, access.capabilities)),
    branchIds: scope.canAll ? null : scope.allowed,
    mutedInApp: prefs.map((p) => p.eventType),
  };
}

const since = () => new Date(Date.now() - RETENTION_DAYS * 86_400_000);

/** SQL twin of `isVisibleTo` */
export function visibleWhere(v: NotificationViewer): Prisma.NotificationWhereInput {
  return {
    showInApp: true,
    createdAt: { gte: since() },
    ...(v.mutedInApp.length ? { type: { notIn: v.mutedInApp } } : {}),
    OR: [
      { userId: v.userId },
      {
        userId: null,
        audience: { in: v.audiences.length ? v.audiences : ["__none__"] },
        ...(v.branchIds
          ? {
              OR: [
                { branchId: null },
                { branchId: { in: v.branchIds.length ? v.branchIds : [-1] } },
              ],
            }
          : {}),
      },
    ],
  };
}

export async function listNotifications(v: NotificationViewer, input: ListNotificationsInput) {
  const prisma = getPrisma();
  const where: Prisma.NotificationWhereInput = {
    AND: [
      visibleWhere(v),
      input.type ? { type: input.type } : {},
      input.unreadOnly ? { reads: { none: { userId: v.userId } } } : {},
    ],
  };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        reads: { where: { userId: v.userId }, select: { readAt: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where }),
    unreadCount(v),
  ]);
  return {
    items: rows.map((r) => ({
      ...toPayload(r),
      branchName: r.branch?.name ?? null,
      readAt: r.reads[0]?.readAt ?? null,
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
    unread,
  };
}

export async function unreadCount(v: NotificationViewer): Promise<number> {
  return getPrisma().notification.count({
    where: { AND: [visibleWhere(v), { reads: { none: { userId: v.userId } } }] },
  });
}

/** Only notifications the viewer can see are touched */
async function visibleIds(v: NotificationViewer, ids: string[]): Promise<bigint[]> {
  const rows = await getPrisma().notification.findMany({
    where: { AND: [visibleWhere(v), { id: { in: ids.map((i) => BigInt(i)) } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function markRead(v: NotificationViewer, ids: string[]) {
  const ok = await visibleIds(v, ids);
  if (ok.length) {
    await getPrisma().notificationRead.createMany({
      data: ok.map((notificationId) => ({ notificationId, userId: v.userId })),
      skipDuplicates: true,
    });
  }
  return { updated: ok.length, unread: await unreadCount(v) };
}

export async function markUnread(v: NotificationViewer, ids: string[]) {
  const ok = await visibleIds(v, ids);
  if (ok.length) {
    await getPrisma().notificationRead.deleteMany({
      where: { userId: v.userId, notificationId: { in: ok } },
    });
  }
  return { updated: ok.length, unread: await unreadCount(v) };
}

export async function markAllRead(v: NotificationViewer) {
  const prisma = getPrisma();
  const rows = await prisma.notification.findMany({
    where: { AND: [visibleWhere(v), { reads: { none: { userId: v.userId } } }] },
    select: { id: true },
    take: 5000,
  });
  if (rows.length) {
    await prisma.notificationRead.createMany({
      data: rows.map((r) => ({ notificationId: r.id, userId: v.userId })),
      skipDuplicates: true,
    });
  }
  return { updated: rows.length, unread: await unreadCount(v) };
}

// ─── Personal preferences ────────────────────────────────────────────────────

export async function getPreferences(user: AuthUser, v: NotificationViewer) {
  const prefs = await getPrisma().notificationPreference.findMany({ where: { userId: v.userId } });
  const byType = new Map(prefs.map((p) => [p.eventType, p]));
  return EVENT_TYPES.filter((t) => {
    const a = eventDef(t)!.audience;
    return a === null || v.audiences.includes(a);
  }).map((t) => ({
    eventType: t,
    label: eventDef(t)!.label,
    inApp: byType.get(t)?.inApp ?? true,
    push: byType.get(t)?.push ?? true,
  }));
}

export async function setPreferences(v: NotificationViewer, input: PreferencesInput) {
  const prisma = getPrisma();
  await prisma.$transaction(
    input.items.map((i) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: v.userId, eventType: i.eventType } },
        create: { userId: v.userId, eventType: i.eventType, inApp: i.inApp, push: i.push },
        update: { inApp: i.inApp, push: i.push },
      }),
    ),
  );
  return { saved: input.items.length };
}

// ─── Web Push subscriptions ──────────────────────────────────────────────────

export const endpointHash = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");

export function pushConfig() {
  return { publicKey: vapidPublicKey() };
}

export async function subscribePush(
  user: AuthUser,
  v: NotificationViewer,
  input: PushSubscribeInput,
) {
  if (!vapidPublicKey())
    throw bizoneError("SERVICE_UNAVAILABLE", "Máy chủ chưa cấu hình Web Push (VAPID)");
  const hash = endpointHash(input.endpoint);
  const data = {
    userId: v.userId,
    username: user.username,
    roles: user.roles
      .filter((r) => r.startsWith("bizone-"))
      .join(",")
      .slice(0, 500),
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.userAgent ?? null,
    failureCount: 0,
  };
  const row = await getPrisma().pushSubscription.upsert({
    where: { endpointHash: hash },
    create: { endpointHash: hash, ...data },
    update: data,
  });
  return { id: row.id };
}

export async function unsubscribePush(v: NotificationViewer, endpoint: string) {
  const res = await getPrisma().pushSubscription.deleteMany({
    where: { endpointHash: endpointHash(endpoint), userId: v.userId },
  });
  return { deleted: res.count };
}

export async function mySubscriptions(v: NotificationViewer) {
  return getPrisma().pushSubscription.findMany({
    where: { userId: v.userId },
    select: { id: true, userAgent: true, createdAt: true, lastSuccessAt: true, endpointHash: true },
    orderBy: { id: "desc" },
  });
}

// ─── Retention ───────────────────────────────────────────────────────────────

/** Delete notifications + delivery log older than 30 days (reads cascade) */
export async function cleanupOld(now = new Date()) {
  const prisma = getPrisma();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const deliveries = await prisma.notificationDelivery.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const notifications = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { notifications: notifications.count, deliveries: deliveries.count };
}

export { isEventType };
