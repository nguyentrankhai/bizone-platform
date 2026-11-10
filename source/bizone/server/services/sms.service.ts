import { normalizePhone, smsText, VN_PHONE } from "@/lib/notifications/template";

/**
 * SMS channel (SRS §8.4 SMS Gateway). Provider by env SMS_PROVIDER:
 * - "http": POST SMS_GATEWAY_URL `{ to, message, brandname }` with `Authorization: Bearer
 *   SMS_GATEWAY_TOKEN` — any 2xx is "sent" (`id` / `messageId` of the JSON reply is kept).
 *   A small adapter in front of the chosen gateway (eSMS, SpeedSMS, Viettel…) maps to it.
 * - "log" (default): printed and recorded as sent by the `log` provider (dev).
 * Accents are stripped unless SMS_UNICODE=true (unaccented SMS = 160 chars per segment).
 */
export interface SmsResult {
  provider: string;
  messageId: string | null;
  text: string;
}

export function smsProvider(): "http" | "log" {
  return process.env.SMS_PROVIDER === "http" ? "http" : "log";
}

export function smsBody(text: string): string {
  return smsText(text, process.env.SMS_UNICODE === "true");
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const phone = normalizePhone(to);
  if (!VN_PHONE.test(phone)) throw new Error(`Số điện thoại không hợp lệ: ${to}`);
  const text = smsBody(message);
  if (!text) throw new Error("Nội dung SMS trống");

  if (smsProvider() === "log") {
    console.log(`[sms:log] to=${phone} (${text.length} ký tự) ${text}`);
    return { provider: "log", messageId: null, text };
  }

  const url = process.env.SMS_GATEWAY_URL;
  if (!url) throw new Error("Chưa cấu hình SMS_GATEWAY_URL");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SMS_GATEWAY_TOKEN
        ? { Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ to: phone, message: text, brandname: process.env.SMS_BRANDNAME ?? "" }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SMS gateway HTTP ${res.status}: ${body.slice(0, 200)}`);
  let messageId: string | null = null;
  try {
    const json = JSON.parse(body) as { id?: unknown; messageId?: unknown };
    const id = json.messageId ?? json.id;
    messageId = id === undefined || id === null ? null : String(id);
  } catch {
    /* non-JSON 2xx reply is still a success */
  }
  return { provider: "http", messageId, text };
}
