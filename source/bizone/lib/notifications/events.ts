import type { Permission } from "@/types/auth";

/**
 * Notification event catalog (SRS §9) — shared by the server (notify / worker / WebSocket) and the
 * settings UI. `audience` is the capability a staff member needs to see a store-wide event (in the
 * bell, over WebSocket and on Web Push); personal events (shift reminder) target one user instead.
 * `defaults` apply until the store saves its own row in `notification_settings`.
 */
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface EventOptionField {
  key: string;
  label: string;
  kind: "number" | "select" | "boolean";
  min?: number;
  max?: number;
  choices?: { value: string; label: string }[];
  default: number | string | boolean;
}

export interface NotificationEventDef {
  label: string;
  description: string;
  /** null = personal event (sent to one user) */
  audience: Permission | null;
  severity: NotificationSeverity;
  defaults: { inApp: boolean; email: boolean; sms: boolean; push: boolean };
  emailTemplate: string | null;
  smsTemplate: string | null;
  /** Template variables available for this event (besides store_name, title, content, link) */
  variables: string[];
  options: EventOptionField[];
  /** Event raised by a module that is not built yet */
  pending?: string;
}

export const NOTIFICATION_EVENTS = {
  order_new: {
    label: "Đơn hàng mới (online)",
    description: "Đơn hàng từ website / sàn / mạng xã hội vừa được tạo",
    audience: "order:read",
    severity: "info",
    defaults: { inApp: true, email: false, sms: false, push: true },
    emailTemplate: "order_new_email",
    smsTemplate: "order_new_sms",
    variables: ["order_code", "channel", "customer_name", "total_amount", "branch_name"],
    options: [],
  },
  low_stock: {
    label: "Cảnh báo tồn kho thấp",
    description: "Tồn kho của sản phẩm xuống tới mức tối thiểu (tối đa 1 lần/ngày mỗi SP/kho)",
    audience: "inventory:read",
    severity: "warning",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "low_stock_email",
    smsTemplate: "generic_sms",
    variables: ["product_name", "sku", "warehouse_name", "quantity", "min_stock", "branch_name"],
    options: [],
  },
  stock_take_diff: {
    label: "Kiểm kê chênh lệch",
    description: "Phiếu kiểm kê hoàn tất có sản phẩm lệch so với hệ thống",
    audience: "inventory:write",
    severity: "warning",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "stock_take_email",
    smsTemplate: "generic_sms",
    variables: ["stock_take_code", "warehouse_name", "diff_count", "surplus", "shortage"],
    options: [],
  },
  customer_debt_overdue: {
    label: "Công nợ khách hàng quá hạn",
    description: "Khoản nợ của khách quá hạn thanh toán (báo lúc quá hạn và lúc quá 30 ngày)",
    audience: "crm:manage_debt",
    severity: "error",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "generic_email",
    smsTemplate: "debt_overdue_sms_staff",
    variables: ["customer_name", "customer_phone", "remaining_amount", "due_date", "days_overdue"],
    options: [
      {
        key: "remindCustomer",
        label: "Nhắn SMS nhắc nợ cho khách (mẫu debt_reminder_sms)",
        kind: "boolean",
        default: false,
      },
    ],
  },
  supplier_debt_due: {
    label: "Công nợ NCC sắp đến hạn",
    description: "Khoản nợ nhà cung cấp sắp đến hạn thanh toán",
    audience: "supplier:manage_po",
    severity: "warning",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "supplier_debt_email",
    smsTemplate: "generic_sms",
    variables: ["supplier_name", "po_code", "remaining_amount", "due_date", "days_left"],
    options: [
      { key: "daysBefore", label: "Báo trước (ngày)", kind: "number", min: 1, max: 30, default: 3 },
    ],
  },
  supplier_debt_overdue: {
    label: "Công nợ NCC quá hạn",
    description: "Khoản nợ nhà cung cấp đã quá hạn thanh toán",
    audience: "supplier:manage_po",
    severity: "error",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "supplier_debt_email",
    smsTemplate: "generic_sms",
    variables: ["supplier_name", "po_code", "remaining_amount", "due_date", "days_overdue"],
    options: [],
  },
  preorder_due: {
    label: "Nhắc lịch giao đơn đặt trước",
    description: "Đơn đặt trước đến hạn giao hôm nay / ngày mai",
    audience: "pos:read",
    severity: "info",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "generic_email",
    smsTemplate: "generic_sms",
    variables: ["preorder_code", "customer_name", "customer_phone", "due_date", "remaining_amount"],
    options: [
      {
        key: "daysBefore",
        label: "Nhắc trước (ngày, 0 = đúng ngày)",
        kind: "number",
        min: 0,
        max: 7,
        default: 1,
      },
      {
        key: "remindCustomer",
        label: "Nhắn SMS cho khách (mẫu preorder_due_sms)",
        kind: "boolean",
        default: false,
      },
    ],
  },
  shift_reminder: {
    label: "Nhắc ca làm việc",
    description: "Nhắc nhân viên trước giờ bắt đầu ca được phân (gửi riêng cho nhân viên đó)",
    audience: null,
    severity: "info",
    defaults: { inApp: true, email: false, sms: false, push: true },
    emailTemplate: "generic_email",
    smsTemplate: "shift_reminder_sms",
    variables: ["shift_name", "start_time", "end_time", "date", "branch_name"],
    options: [
      {
        key: "minutesBefore",
        label: "Nhắc trước (phút)",
        kind: "number",
        min: 5,
        max: 240,
        default: 30,
      },
    ],
  },
  report_scheduled: {
    label: "Báo cáo định kỳ",
    description: "Gửi email báo cáo kèm file theo lịch (07:00 giờ VN)",
    audience: "report:read",
    severity: "success",
    defaults: { inApp: false, email: false, sms: false, push: false },
    emailTemplate: "report_scheduled_email",
    smsTemplate: null,
    variables: ["report_name", "period", "net_revenue", "invoice_count", "profit"],
    options: [
      {
        key: "frequency",
        label: "Tần suất",
        kind: "select",
        choices: [
          { value: "daily", label: "Hằng ngày (hôm qua)" },
          { value: "weekly", label: "Hằng tuần (thứ Hai, tuần trước)" },
          { value: "monthly", label: "Hằng tháng (ngày 1, tháng trước)" },
        ],
        default: "weekly",
      },
      {
        key: "reportType",
        label: "Báo cáo",
        kind: "select",
        choices: [
          { value: "revenue", label: "Doanh thu" },
          { value: "profit", label: "Lợi nhuận" },
          { value: "products", label: "Sản phẩm" },
          { value: "staff", label: "Nhân viên" },
        ],
        default: "revenue",
      },
      {
        key: "format",
        label: "File đính kèm",
        kind: "select",
        choices: [
          { value: "xlsx", label: "Excel" },
          { value: "pdf", label: "PDF" },
        ],
        default: "xlsx",
      },
    ],
  },
  campaign_completed: {
    label: "Chiến dịch marketing đã gửi xong",
    description: "Kết quả gửi chiến dịch SMS / Email",
    audience: "marketing:campaign",
    severity: "success",
    defaults: { inApp: true, email: false, sms: false, push: false },
    emailTemplate: "generic_email",
    smsTemplate: "generic_sms",
    variables: ["campaign_name", "sent", "failed", "total"],
    options: [],
  },
  sync_failed: {
    label: "Đồng bộ kênh bán lỗi",
    description: "Đồng bộ đơn / sản phẩm với sàn TMĐT thất bại",
    audience: "admin:*",
    severity: "error",
    defaults: { inApp: true, email: false, sms: false, push: true },
    emailTemplate: "generic_email",
    smsTemplate: "generic_sms",
    variables: ["channel", "error"],
    options: [],
    pending: "Phát sinh khi có Omni Channel (P6.1)",
  },
} satisfies Record<string, NotificationEventDef>;

export type NotificationEventType = keyof typeof NOTIFICATION_EVENTS;

export const EVENT_TYPES = Object.keys(NOTIFICATION_EVENTS) as NotificationEventType[];

export function eventDef(type: string): NotificationEventDef | null {
  return (NOTIFICATION_EVENTS as Record<string, NotificationEventDef>)[type] ?? null;
}

export function isEventType(type: string): type is NotificationEventType {
  return type in NOTIFICATION_EVENTS;
}

/** Capabilities that unlock store-wide notifications (checked per viewer) */
export const AUDIENCES: Permission[] = [
  ...new Set(
    Object.values(NOTIFICATION_EVENTS as Record<string, NotificationEventDef>)
      .map((e) => e.audience)
      .filter((a): a is Permission => a !== null),
  ),
];

/** Variables every template may use */
export const COMMON_VARIABLES = ["store_name", "title", "content", "link", "created_at"];

/** Option values merged with defaults (unknown keys dropped, wrong types → default) */
export function eventOptions(
  type: string,
  stored: Record<string, unknown> | null | undefined,
): Record<string, number | string | boolean> {
  const def = eventDef(type);
  const out: Record<string, number | string | boolean> = {};
  for (const f of def?.options ?? []) {
    const v = stored?.[f.key];
    if (f.kind === "number" && typeof v === "number" && Number.isFinite(v)) {
      out[f.key] = Math.min(f.max ?? v, Math.max(f.min ?? v, Math.round(v)));
    } else if (f.kind === "boolean" && typeof v === "boolean") {
      out[f.key] = v;
    } else if (
      f.kind === "select" &&
      typeof v === "string" &&
      f.choices?.some((c) => c.value === v)
    ) {
      out[f.key] = v;
    } else {
      out[f.key] = f.default;
    }
  }
  return out;
}

export const SEVERITY_STYLE: Record<NotificationSeverity, { dot: string; label: string }> = {
  info: { dot: "bg-blue-500", label: "Thông tin" },
  success: { dot: "bg-emerald-500", label: "Thành công" },
  warning: { dot: "bg-amber-500", label: "Cảnh báo" },
  error: { dot: "bg-red-500", label: "Khẩn" },
};

/** WebSocket of the realtime process (same port as the POS sync) */
export const NOTIFY_WS_PATH = "/ws/notifications";
export const NOTIFY_WS_PROTOCOL = "bizone-notify";
/** Redis pub/sub channel of one tenant's new notifications */
export const notifyChannel = (tenantId: string) => `bizone:notify:${tenantId}`;
export const NOTIFY_CHANNEL_PATTERN = "bizone:notify:*";
export function parseNotifyChannel(channel: string): string | null {
  const m = /^bizone:notify:([A-Za-z0-9_-]+)$/.exec(channel);
  return m ? m[1] : null;
}

/** Notifications older than this are deleted (SRS: lưu 30 ngày) */
export const RETENTION_DAYS = 30;

/** Payload of `notification:new` (WS) and of the Redis channel */
export interface NotificationPayload {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  content: string | null;
  link: string | null;
  audience: string | null;
  userId: number | null;
  branchId: number | null;
  createdAt: string;
}

/** Who may see what — computed per staff member (tRPC + WebSocket + push) */
export interface NotificationViewer {
  userId: number;
  audiences: string[];
  /** null = every branch */
  branchIds: number[] | null;
  /** Event types muted in the bell */
  mutedInApp: string[];
}

/** Same rule as the SQL filter in notification.service `visibleWhere` */
export function isVisibleTo(
  n: Pick<NotificationPayload, "type" | "audience" | "userId" | "branchId">,
  v: NotificationViewer,
): boolean {
  if (v.mutedInApp.includes(n.type)) return false;
  if (n.userId !== null) return n.userId === v.userId;
  if (!n.audience || !v.audiences.includes(n.audience)) return false;
  if (n.branchId !== null && v.branchIds !== null && !v.branchIds.includes(n.branchId))
    return false;
  return true;
}
