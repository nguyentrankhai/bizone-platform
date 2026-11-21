import { Queue } from "bullmq";
import { getPrisma } from "@/lib/prisma";
import { describeError } from "@/lib/redis";
import { sendMail } from "@/lib/mail";
import { queueConnection } from "@/services/queue/connection";
import { NOTIFICATION_EVENTS, isNotificationEvent } from "@/services/notification/events";

/**
 * E-mail copy of notifications (P7.3, SRS-PH-NOTIF-02) — BullMQ "payhub-notification": the sender
 * only enqueues `{ notificationId }`; the worker renders the template and sends through SMTP
 * (lib/mail.ts; no SMTP_HOST = "log" provider). 4 attempts, exponential back-off from 30 s; the
 * outcome is stored on the row (email_status / email_error / email_sent_at).
 */

export const NOTIFICATION_QUEUE = "payhub-notification";

export type NotificationJob = { kind: "email"; notificationId: string };

const globalForQueue = globalThis as unknown as {
  payhubNotificationQueue?: Queue<NotificationJob>;
};

export function getNotificationQueue(): Queue<NotificationJob> {
  if (!globalForQueue.payhubNotificationQueue) {
    const queue = new Queue<NotificationJob>(NOTIFICATION_QUEUE, {
      connection: queueConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 7 * 86400, count: 1000 },
        removeOnFail: { age: 30 * 86400, count: 1000 },
      },
    });
    queue.on("error", (err) => console.error(`[notification-queue] ${describeError(err)}`));
    globalForQueue.payhubNotificationQueue = queue;
  }
  return globalForQueue.payhubNotificationQueue;
}

export async function enqueueNotificationEmail(id: bigint): Promise<void> {
  await getNotificationQueue().add(
    "email",
    { kind: "email", notificationId: id.toString() },
    { jobId: `email-${id}` },
  );
}

const vnTime = (d: Date) =>
  new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Worker processor: send the e-mail of one notification. */
export async function processNotificationJob(job: { data: NotificationJob }): Promise<string> {
  const prisma = getPrisma();
  const id = BigInt(job.data.notificationId);
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) return "skipped: notification removed";
  if (n.emailStatus === "sent") return "skipped: already sent";
  if (!isNotificationEvent(n.event)) return "skipped: unknown event";

  const { getSetting } = await import("@/services/notification/sender");
  const setting = await getSetting(n.event);
  if (setting.emailTo.length === 0) {
    await prisma.notification.update({
      where: { id },
      data: { emailStatus: "failed", emailError: "Chưa cấu hình người nhận (NOTIFY_EMAILS)" },
    });
    return "skipped: no recipients";
  }
  const appUrl = (process.env.APP_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const label = NOTIFICATION_EVENTS[n.event].label;
  const url = n.link ? `${appUrl}${n.link}` : `${appUrl}/notifications`;
  const lines = [
    n.title,
    "",
    n.message ?? "",
    "",
    `Loại: ${label} · Thời gian: ${vnTime(n.createdAt)} (GMT+7)`,
    `Xem chi tiết: ${url}`,
    "",
    "— Payment Hub (email tự động, không trả lời)",
  ];
  try {
    const res = await sendMail({
      to: setting.emailTo,
      subject: `[Payment Hub] ${n.severity === "Error" ? "Cảnh báo: " : ""}${n.title}`,
      text: lines.join("\n"),
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
<p style="font-size:16px;font-weight:bold">${esc(n.title)}</p>
<p>${esc(n.message ?? "").replace(/\n/g, "<br>")}</p>
<p style="color:#6b7280">Loại: ${esc(label)} · ${vnTime(n.createdAt)} (GMT+7)</p>
<p><a href="${esc(url)}">Xem chi tiết trên Payment Hub</a></p>
<p style="color:#9ca3af;font-size:12px">Email tự động — không trả lời.</p></div>`,
    });
    await prisma.notification.update({
      where: { id },
      data: { emailStatus: "sent", emailError: null, emailSentAt: new Date() },
    });
    return `sent (${res.provider}) to ${setting.emailTo.length} recipient(s)`;
  } catch (e) {
    await prisma.notification.update({
      where: { id },
      data: { emailError: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
    });
    throw e;
  }
}

/** Last attempt failed. */
export async function markEmailFailed(notificationId: string, message: string): Promise<void> {
  await getPrisma()
    .notification.update({
      where: { id: BigInt(notificationId) },
      data: { emailStatus: "failed", emailError: message.slice(0, 500) },
    })
    .catch(() => {});
}
