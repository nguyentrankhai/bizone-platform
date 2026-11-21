import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { publishEvent } from "@/lib/events";
import { Prisma } from "@/generated/prisma/client";
import { enqueueNotificationEmail } from "@/server/jobs/notificationQueue";
import {
  NOTIFICATION_EVENTS,
  effectiveSetting,
  type EffectiveSetting,
  type NotificationEvent,
} from "./events";

/**
 * Notification sender (P7.3, SRS §9) — `notify(event, …)` is the single entry point used by the
 * modules (payments, webhooks, reconciliation, refunds, connectors, disputes):
 *   1. channels + threshold of the event (notification_settings, else defaults of events.ts)
 *   2. one `notifications` row (dedupe_key unique → an occurrence notifies once)
 *   3. in-app: realtime `notification.created` on Redis "payhub:events" → WebSocket relay →
 *      bell + center of every console allowed to see it (audience, merchant)
 *   4. e-mail: job on the "payhub-notification" queue → worker sends via SMTP (lib/mail.ts)
 * It never throws: a notification problem must not break the business flow it reports on.
 */

const SETTINGS_TTL_MS = 10_000;
let settingsCache: {
  at: number;
  rows: Map<string, Prisma.NotificationSettingGetPayload<object>>;
} | null = null;

export function defaultEmailRecipients(): string[] {
  return (process.env.NOTIFY_EMAILS || process.env.DISPUTE_NOTIFY_EMAILS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getSetting(event: NotificationEvent): Promise<EffectiveSetting> {
  const now = Date.now();
  if (!settingsCache || now - settingsCache.at > SETTINGS_TTL_MS) {
    const rows = await getPrisma().notificationSetting.findMany();
    settingsCache = { at: now, rows: new Map(rows.map((r) => [r.event, r])) };
  }
  return effectiveSetting(event, settingsCache.rows.get(event), defaultEmailRecipients());
}

/** After a settings change in this process. */
export function invalidateSettings(): void {
  settingsCache = null;
}

export interface NotifyInput {
  title: string;
  message?: string;
  /** Page of the admin console (relative, e.g. /transactions/12) */
  link?: string;
  merchantId?: number | null;
  referenceType?: string;
  referenceId?: string | number | bigint;
  data?: Record<string, unknown>;
  /** Same key → notified once (e.g. `webhook:{deliveryId}`) */
  dedupeKey?: string;
}

export async function notify(event: NotificationEvent, input: NotifyInput): Promise<bigint | null> {
  try {
    const setting = await getSetting(event);
    const wantEmail = setting.email && setting.emailTo.length > 0;
    if (!setting.inApp && !wantEmail) return null;
    const spec = NOTIFICATION_EVENTS[event];
    let row;
    try {
      row = await getPrisma().notification.create({
        data: {
          event,
          severity: spec.severity,
          audience: spec.audience,
          merchantId: input.merchantId ?? null,
          title: input.title.slice(0, 255),
          message: input.message?.slice(0, 4000) ?? null,
          link: input.link?.slice(0, 255) ?? null,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId === undefined ? null : String(input.referenceId),
          data: input.data ? (input.data as Prisma.InputJsonValue) : Prisma.DbNull,
          inApp: setting.inApp,
          dedupeKey: input.dedupeKey?.slice(0, 150) ?? null,
          emailStatus: wantEmail ? "pending" : "none",
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
    if (setting.inApp) {
      void publishEvent("notification.created", {
        id: row.id.toString(),
        event,
        severity: row.severity,
        audience: row.audience,
        merchantId: row.merchantId,
        title: row.title,
        message: row.message,
        link: row.link,
        createdAt: row.createdAt.toISOString(),
      }).catch(() => {});
    }
    if (wantEmail) {
      await enqueueNotificationEmail(row.id).catch(async (e: unknown) => {
        await getPrisma()
          .notification.update({
            where: { id: row.id },
            data: {
              emailStatus: "failed",
              emailError: `queue: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
            },
          })
          .catch(() => {});
      });
    }
    return row.id;
  } catch (e) {
    console.error(`[notify] ${event}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// ─── Threshold helpers ────────────────────────────────────────────────────────

/**
 * Suspicious activity (SRS §9.1): count failed payments per customer IP in a sliding window
 * (Redis); the threshold-th failure inside the window notifies once for that window.
 */
export async function trackFailedPaymentIp(
  ip: string | null | undefined,
  txn: { txnCode: string; merchantId: number },
): Promise<void> {
  if (!ip) return;
  try {
    const s = await getSetting("transaction.suspicious");
    if (!s.threshold) return;
    const windowS = (s.windowMinutes ?? 10) * 60;
    const key = `payhub:notify:failip:${ip}`;
    const redis = getRedis();
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowS);
    if (n !== s.threshold) return;
    const started = Math.floor(Date.now() / 1000 / windowS);
    await notify("transaction.suspicious", {
      title: `${n} giao dịch thất bại từ cùng IP ${ip}`,
      message: `Phát hiện ${n} giao dịch thất bại liên tiếp từ IP ${ip} trong ${s.windowMinutes} phút (gần nhất ${txn.txnCode}, merchant #${txn.merchantId}).`,
      link: `/transactions?search=${encodeURIComponent(txn.txnCode)}`,
      referenceType: "ip",
      referenceId: ip,
      data: { ip, count: n, windowMinutes: s.windowMinutes, lastTxn: txn.txnCode },
      dedupeKey: `suspicious:${ip}:${started}`,
    });
  } catch (e) {
    console.error(`[notify] suspicious tracking: ${e instanceof Error ? e.message : e}`);
  }
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}₫`;

/** Payment outcome applied by IPN / status query (payment.service). */
export async function notifyPaymentResult(txn: {
  id: number;
  txnCode: string;
  merchantId: number;
  amount: number;
  status: "Success" | "Failed";
  partner?: string | null;
  error?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  if (txn.status === "Success") {
    await notify("transaction.success", {
      title: `Thanh toán ${vnd(txn.amount)} thành công`,
      message: `Mã GD: ${txn.txnCode}${txn.partner ? ` · ${txn.partner}` : ""}`,
      link: `/transactions/${txn.id}`,
      merchantId: txn.merchantId,
      referenceType: "transaction",
      referenceId: txn.id,
      dedupeKey: `txn:${txn.id}:Success`,
    });
    return;
  }
  await notify("transaction.failed", {
    title: `Thanh toán ${vnd(txn.amount)} thất bại`,
    message: `Mã GD: ${txn.txnCode}${txn.error ? ` — ${txn.error}` : ""}${txn.partner ? ` (${txn.partner})` : ""}`,
    link: `/transactions/${txn.id}`,
    merchantId: txn.merchantId,
    referenceType: "transaction",
    referenceId: txn.id,
    dedupeKey: `txn:${txn.id}:Failed`,
  });
  await trackFailedPaymentIp(txn.ipAddress, txn);
}

// ─── Retention ────────────────────────────────────────────────────────────────

export async function purgeNotifications(now = new Date(), days = 30): Promise<number> {
  const { count } = await getPrisma().notification.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - days * 86_400_000) } },
  });
  return count;
}
