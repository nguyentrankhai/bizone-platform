/**
 * Notification events of Payment Hub (P7.3, SRS §9.1) — catalogue + defaults. Pure data (no server
 * imports): shared by the sender, the API and the settings screen. A `notification_settings` row
 * overrides the channels / threshold of an event; without one the defaults below apply.
 *
 * audience: "all"   every admin-console user (payhub-admin + payhub-viewer; a merchant-bound
 *                   token only sees notifications of its merchant)
 *           "admin" payhub-admin only (operational alerts)
 */

export type NotificationSeverity = "Success" | "Warning" | "Error" | "Info";
export type NotificationAudience = "all" | "admin";

export interface EventSpec {
  label: string;
  description: string;
  severity: NotificationSeverity;
  audience: NotificationAudience;
  inApp: boolean;
  email: boolean;
  /** Threshold rule of the event (null = notify every occurrence) */
  threshold: number | null;
  thresholdLabel?: string;
  windowMinutes?: number;
  windowLabel?: string;
}

export const NOTIFICATION_EVENTS = {
  "transaction.success": {
    label: "Giao dịch thành công",
    description: "Đối tác xác nhận thanh toán (IPN / tra cứu)",
    severity: "Success",
    audience: "all",
    inApp: true,
    email: false,
    threshold: null,
  },
  "transaction.failed": {
    label: "Giao dịch thất bại",
    description: "Đối tác báo thanh toán thất bại",
    severity: "Error",
    audience: "all",
    inApp: true,
    email: false,
    threshold: null,
  },
  "transaction.suspicious": {
    label: "Giao dịch đáng ngờ",
    description: "Nhiều giao dịch thất bại liên tiếp từ cùng một IP khách",
    severity: "Warning",
    audience: "admin",
    inApp: true,
    email: true,
    threshold: 10,
    thresholdLabel: "Số GD thất bại từ cùng IP",
    windowMinutes: 10,
    windowLabel: "Trong khoảng (phút)",
  },
  "webhook.failed": {
    label: "Webhook thất bại",
    description: "Gửi webhook cho merchant thất bại nhiều lần (hoặc hết lượt thử)",
    severity: "Error",
    audience: "admin",
    inApp: true,
    email: true,
    threshold: 5,
    thresholdLabel: "Thông báo khi số lần gửi lỗi đạt",
  },
  "recon.discrepancy": {
    label: "Đối soát chênh lệch",
    description: "Đợt đối soát hoàn tất có giao dịch lệch",
    severity: "Warning",
    audience: "admin",
    inApp: true,
    email: true,
    threshold: 1,
    thresholdLabel: "Số GD lệch tối thiểu",
  },
  "refund.completed": {
    label: "Hoàn tiền hoàn tất",
    description: "Đối tác xác nhận hoàn tiền",
    severity: "Success",
    audience: "all",
    inApp: true,
    email: false,
    threshold: null,
  },
  "connector.down": {
    label: "Kết nối đối tác lỗi",
    description: "Health check lỗi liên tiếp hoặc circuit breaker mở",
    severity: "Error",
    audience: "admin",
    inApp: true,
    email: true,
    threshold: 3,
    thresholdLabel: "Số lần kiểm tra lỗi liên tiếp",
  },
  "dispute.resolved": {
    label: "Tra soát có kết quả",
    description: "Yêu cầu tra soát được đóng (đã giải quyết / từ chối)",
    severity: "Info",
    audience: "all",
    inApp: true,
    email: false,
    threshold: null,
  },
} as const satisfies Record<string, EventSpec>;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;

export const NOTIFICATION_EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];

export function isNotificationEvent(e: string): e is NotificationEvent {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, e);
}

/** Channels + threshold actually in force for an event. */
export interface EffectiveSetting {
  event: NotificationEvent;
  inApp: boolean;
  email: boolean;
  threshold: number | null;
  windowMinutes: number | null;
  emailTo: string[];
  customized: boolean;
}

export function effectiveSetting(
  event: NotificationEvent,
  row:
    | {
        inApp: boolean;
        email: boolean;
        threshold: number | null;
        windowMinutes: number | null;
        emailTo: string | null;
      }
    | null
    | undefined,
  defaultEmailTo: string[] = [],
): EffectiveSetting {
  const spec: EventSpec = NOTIFICATION_EVENTS[event];
  const to = row?.emailTo
    ? row.emailTo
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : defaultEmailTo;
  return {
    event,
    inApp: row ? row.inApp : spec.inApp,
    email: row ? row.email : spec.email,
    threshold: spec.threshold === null ? null : (row?.threshold ?? spec.threshold),
    windowMinutes: spec.windowMinutes ? (row?.windowMinutes ?? spec.windowMinutes) : null,
    emailTo: to,
    customized: !!row,
  };
}

/** Retention of the notification center (SRS-PH-NOTIF-03). */
export const NOTIFICATION_RETENTION_DAYS = 30;
