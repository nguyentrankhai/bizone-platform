import { sendNotification, WebPushError } from "web-push";

/**
 * Web Push (VAPID). Keys from env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate once with
 * `npx web-push generate-vapid-keys`), contact VAPID_SUBJECT (mailto:…). Without keys push is off.
 */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  link: string | null;
  tag: string;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? process.env.VAPID_PUBLIC_KEY
    : null;
}

/** "gone" = the browser dropped the subscription (404/410) → delete it */
export async function sendPush(
  target: PushTarget,
  msg: PushMessage,
): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }> {
  const publicKey = vapidPublicKey();
  if (!publicKey) return { ok: false, gone: false, error: "Chưa cấu hình VAPID" };
  try {
    await sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(msg),
      {
        TTL: 60 * 60,
        timeout: 15_000,
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT ?? "mailto:admin@bizone.local",
          publicKey,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
      },
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof WebPushError) {
      return {
        ok: false,
        gone: err.statusCode === 404 || err.statusCode === 410,
        error: `HTTP ${err.statusCode}: ${String(err.body ?? err.message).slice(0, 200)}`,
      };
    }
    return { ok: false, gone: false, error: err instanceof Error ? err.message : String(err) };
  }
}
