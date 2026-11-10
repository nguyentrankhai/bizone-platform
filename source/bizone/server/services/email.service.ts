import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email channel (SRS §9: Email SMTP template). Provider by env:
 * - SMTP_HOST set → SMTP (nodemailer), sender MAIL_FROM;
 * - otherwise "log": the message is printed and recorded as sent by the `log` provider
 *   (dev without a mail server — the delivery log still shows the exact content).
 */
export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export interface SendResult {
  provider: string;
  messageId: string | null;
}

export function emailProvider(): "smtp" | "log" {
  return process.env.SMTP_HOST ? "smtp" : "log";
}

const globalForMail = globalThis as unknown as { bizoneMailer?: Transporter };

function transporter(): Transporter {
  if (!globalForMail.bizoneMailer) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    globalForMail.bizoneMailer = nodemailer.createTransport({
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
  return globalForMail.bizoneMailer;
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (msg.to.length === 0) throw new Error("Không có địa chỉ email nhận");
  if (emailProvider() === "log") {
    console.log(
      `[email:log] to=${msg.to.join(",")} subject=${JSON.stringify(msg.subject)} ` +
        `attachments=${msg.attachments?.length ?? 0}\n${msg.text}`,
    );
    return { provider: "log", messageId: null };
  }
  const info = await transporter().sendMail({
    from: process.env.MAIL_FROM ?? "BizOne <no-reply@bizone.local>",
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: msg.attachments,
  });
  return { provider: "smtp", messageId: info.messageId ?? null };
}
