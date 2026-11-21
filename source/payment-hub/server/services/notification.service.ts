import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  effectiveSetting,
  type NotificationEvent,
} from "@/services/notification/events";
import { defaultEmailRecipients, invalidateSettings } from "@/services/notification/sender";
import { checkEmailList } from "@/lib/dispute";

/**
 * Notification center (P7.3): what one admin-console user sees and has read.
 * Visible = in-app row, audience "all" (or "admin" for payhub-admin), and — for a merchant-bound
 * token — only that merchant's rows. Read state is per Keycloak user (notification_reads).
 */

export interface Viewer {
  sub: string;
  admin: boolean;
  merchantId?: number;
}

function visibleWhere(v: Viewer): Prisma.NotificationWhereInput {
  return {
    inApp: true,
    ...(v.admin ? {} : { audience: "all" }),
    ...(v.merchantId !== undefined ? { merchantId: v.merchantId } : {}),
  };
}

export interface NotificationView {
  id: string;
  event: string;
  severity: string;
  title: string;
  message: string | null;
  link: string | null;
  merchantId: number | null;
  createdAt: string;
  read: boolean;
}

export async function listNotifications(
  v: Viewer,
  q: { unread?: boolean; event?: string; severity?: string; page: number; limit: number },
) {
  const prisma = getPrisma();
  const base = visibleWhere(v);
  const where: Prisma.NotificationWhereInput = {
    ...base,
    ...(q.event ? { event: q.event } : {}),
    ...(q.severity ? { severity: q.severity as Prisma.NotificationWhereInput["severity"] } : {}),
    ...(q.unread ? { reads: { none: { userSub: v.sub } } } : {}),
  };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { reads: { where: { userSub: v.sub }, select: { readAt: true } } },
      orderBy: { id: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...base, reads: { none: { userSub: v.sub } } } }),
  ]);
  const items: NotificationView[] = rows.map((r) => ({
    id: r.id.toString(),
    event: r.event,
    severity: r.severity,
    title: r.title,
    message: r.message,
    link: r.link,
    merchantId: r.merchantId,
    createdAt: r.createdAt.toISOString(),
    read: r.reads.length > 0,
  }));
  return { items, total, unread };
}

/** Mark some (ids) or all visible notifications as read for this user. */
export async function markRead(v: Viewer, ids: string[] | "all"): Promise<number> {
  const prisma = getPrisma();
  const targets = await prisma.notification.findMany({
    where: {
      ...visibleWhere(v),
      reads: { none: { userSub: v.sub } },
      ...(ids === "all" ? {} : { id: { in: ids.map((i) => BigInt(i)) } }),
    },
    select: { id: true },
    take: 5000,
  });
  if (targets.length === 0) return 0;
  const { count } = await prisma.notificationRead.createMany({
    data: targets.map((t) => ({ notificationId: t.id, userSub: v.sub })),
    skipDuplicates: true,
  });
  return count;
}

// ─── Settings (payhub-admin) ──────────────────────────────────────────────────

export async function getSettings() {
  const rows = new Map(
    (await getPrisma().notificationSetting.findMany()).map((r) => [r.event, r] as const),
  );
  const defaultTo = defaultEmailRecipients();
  return {
    defaultEmailTo: defaultTo,
    smtp: process.env.SMTP_HOST ? "smtp" : "log",
    events: NOTIFICATION_EVENT_KEYS.map((event) => {
      const spec = NOTIFICATION_EVENTS[event];
      const row = rows.get(event);
      const eff = effectiveSetting(event, row, defaultTo);
      return {
        event,
        label: spec.label,
        description: spec.description,
        severity: spec.severity,
        audience: spec.audience,
        inApp: eff.inApp,
        email: eff.email,
        threshold: eff.threshold,
        thresholdLabel: "thresholdLabel" in spec ? spec.thresholdLabel : null,
        windowMinutes: eff.windowMinutes,
        windowLabel: "windowLabel" in spec ? spec.windowLabel : null,
        emailTo: row?.emailTo ?? "",
        customized: !!row,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

export interface SettingInput {
  event: NotificationEvent;
  inApp: boolean;
  email: boolean;
  threshold?: number | null;
  windowMinutes?: number | null;
  emailTo?: string | null;
}

export class SettingsError extends Error {
  constructor(
    message: string,
    public readonly details: Record<string, string>,
  ) {
    super(message);
  }
}

export async function updateSettings(input: SettingInput[], username: string) {
  const errors: Record<string, string> = {};
  for (const s of input) {
    const spec = NOTIFICATION_EVENTS[s.event];
    if (spec.threshold === null && s.threshold != null) {
      errors[`${s.event}.threshold`] = "Sự kiện này không có ngưỡng";
    }
    if (s.emailTo) {
      const e = checkEmailList(s.emailTo);
      if (e) errors[`${s.event}.emailTo`] = e;
    }
  }
  if (Object.keys(errors).length) throw new SettingsError("Cấu hình không hợp lệ", errors);
  const prisma = getPrisma();
  await prisma.$transaction(
    input.map((s) => {
      const spec = NOTIFICATION_EVENTS[s.event];
      const data = {
        inApp: s.inApp,
        email: s.email,
        threshold: spec.threshold === null ? null : (s.threshold ?? spec.threshold),
        windowMinutes: "windowMinutes" in spec ? (s.windowMinutes ?? spec.windowMinutes) : null,
        emailTo: s.emailTo?.trim() || null,
        updatedBy: username,
      };
      return prisma.notificationSetting.upsert({
        where: { event: s.event },
        create: { event: s.event, ...data },
        update: data,
      });
    }),
  );
  invalidateSettings();
  return getSettings();
}
