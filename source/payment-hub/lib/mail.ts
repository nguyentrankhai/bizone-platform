import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing e-mail of Payment Hub (P5.6: disputes sent to partners + result notifications).
 * Provider by env (same convention as BizOne P4.7):
 *  - SMTP_HOST set → SMTP (nodemailer), sender MAIL_FROM;
 *  - otherwise "log": the message is printed by the server and reported as provider `log`
 *    (dev without a mail server — callers show that nothing was really sent).
 */

export interface MailMessage {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export interface MailResult {
  provider: "smtp" | "log";
  messageId: string | null;
}

export function mailProvider(): "smtp" | "log" {
  return process.env.SMTP_HOST ? "smtp" : "log";
}

const globalForMail = globalThis as unknown as { payhubMailer?: Transporter };

function transporter(): Transporter {
  if (!globalForMail.payhubMailer) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    globalForMail.payhubMailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return globalForMail.payhubMailer;
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (msg.to.length === 0) throw new Error("Không có địa chỉ email nhận");
  if (mailProvider() === "log") {
    console.log(
      `[mail:log] to=${msg.to.join(",")}${msg.cc?.length ? ` cc=${msg.cc.join(",")}` : ""} ` +
        `subject=${JSON.stringify(msg.subject)} attachments=${msg.attachments?.length ?? 0}\n${msg.text}`,
    );
    return { provider: "log", messageId: null };
  }
  const info = await transporter().sendMail({
    from: process.env.MAIL_FROM ?? "Payment Hub <no-reply@payhub.local>",
    to: msg.to,
    cc: msg.cc,
    replyTo: msg.replyTo,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: msg.attachments,
  });
  return { provider: "smtp", messageId: info.messageId ?? null };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
