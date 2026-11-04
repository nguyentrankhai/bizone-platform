/**
 * Outgoing webhook events (API-Design-PaymentHub §7) — shared by API, worker and admin UI.
 */

export const WEBHOOK_EVENTS = [
  { code: "payment.success", label: "Thanh toán thành công" },
  { code: "payment.failed", label: "Thanh toán thất bại" },
  { code: "payment.expired", label: "Giao dịch hết hạn" },
  { code: "refund.completed", label: "Hoàn tiền hoàn tất" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["code"];
export const WEBHOOK_EVENT_CODES = WEBHOOK_EVENTS.map((e) => e.code) as [
  WebhookEvent,
  ...WebhookEvent[],
];

/** Sent by "Ping test" only; never subscribed to. */
export const PING_EVENT = "webhook.ping";

/** Retry schedule after the first attempt (seconds): 1 min, 5 min, 15 min, 1 h, 6 h. */
export const DEFAULT_RETRY_INTERVALS = [60, 300, 900, 3600, 21600];
export const DEFAULT_RETRY_COUNT = 5;

export function describeIntervals(seconds: number[]): string {
  return seconds
    .map((s) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}ph` : `${s}s`))
    .join(" → ");
}

export interface WebhookConfigView {
  id: number;
  merchantId: number;
  merchantCode: string;
  url: string;
  events: WebhookEvent[];
  status: "Active" | "Inactive";
  retryCount: number;
  retryIntervals: number[];
  timeoutMs: number;
  /** Masked — the full secret is shown once, on create / rotate. */
  secretHint: string;
  stats: { total: number; success: number; failed: number };
  createdAt: string;
  updatedAt: string;
}

export interface WebhookLogView {
  id: string;
  deliveryId: string | null;
  webhookConfigId: number | null;
  transactionId: number | null;
  txnCode: string | null;
  event: string;
  requestUrl: string | null;
  responseStatus: number | null;
  status: "Success" | "Failed";
  attempt: number;
  maxRetries: number;
  nextRetryAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WebhookLogDetail extends WebhookLogView {
  requestHeaders: Record<string, string> | null;
  requestBody: unknown;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
}

export interface WebhookStats {
  periodHours: number;
  attempts: number;
  success: number;
  failed: number;
  successRate: number | null;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
  pendingRetries: number;
  pendingOutbox: number;
}
