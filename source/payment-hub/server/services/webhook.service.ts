import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma, type WebhookConfig } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_INTERVALS,
  PING_EVENT,
  type WebhookConfigView,
  type WebhookEvent,
  type WebhookLogDetail,
  type WebhookLogView,
  type WebhookStats,
} from "@/lib/webhook-events";
import { enqueueWebhook, getWebhookQueue } from "@/services/webhook/queue";
import { sendWebhook, type SendResult } from "@/services/webhook/sender";

/**
 * Webhook engine (P3.6, API-Design-PaymentHub §6.5–6.6, §7).
 *
 * Transaction events use a transactional outbox on `transactions`:
 *   the status change sets notify_webhook = 1, webhook_sent_at = NULL in the same DB transaction;
 *   dispatchTransactionWebhook() claims the row (webhook_sent_at = now) and enqueues one job per
 *   endpoint; the worker's sweeper re-dispatches anything left unclaimed (Redis down, crash).
 * Each HTTP attempt — queued retry, manual replay or ping — is one webhook_logs row; attempts of
 * the same message share delivery_id (= X-Webhook-Id).
 */

export class WebhookError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

const STATUS_EVENT: Record<string, WebhookEvent> = {
  Success: "payment.success",
  Failed: "payment.failed",
  Expired: "payment.expired",
  // A refund (P5.3) may land before the payment.success outbox row was dispatched: only a
  // payment change sets transactions.notify_webhook, so the pending event is still payment.success.
  PartiallyRefunded: "payment.success",
  Refunded: "payment.success",
};

/** Deterministic UUID for (transaction, event) → the same message keeps the same X-Webhook-Id. */
export function deliveryIdFor(txnCode: string, event: string): string {
  const h = createHash("sha256").update(`${txnCode}|${event}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

function intervalsOf(c: Pick<WebhookConfig, "retryIntervals">): number[] {
  const v = c.retryIntervals as unknown;
  return Array.isArray(v) && v.length > 0 && v.every((n) => Number.isInteger(n) && n > 0)
    ? (v as number[])
    : DEFAULT_RETRY_INTERVALS;
}

function eventsOf(c: Pick<WebhookConfig, "events">): WebhookEvent[] {
  return Array.isArray(c.events) ? (c.events as WebhookEvent[]) : [];
}

// ─── Payload ──────────────────────────────────────────────────────────────────

type TxnForPayload = Prisma.TransactionGetPayload<{
  include: { partnerConfig: { select: { connectorType: true } }; logs: true };
}>;

export function buildTransactionPayload(txn: TxnForPayload, event: WebhookEvent) {
  const base = {
    event,
    transaction_id: txn.txnCode,
    merchant_txn_id: txn.merchantTxnId,
    amount: Number(txn.amount),
    currency: txn.currency,
    status: txn.status,
    payment_method: txn.paymentMethod,
    partner: txn.partnerConfig?.connectorType ?? null,
  };
  if (event === "payment.success") {
    return {
      ...base,
      partner_txn_id: txn.partnerTxnId,
      paid_at: txn.paidAt?.toISOString() ?? null,
    };
  }
  const finalLog = [...txn.logs].reverse().find((l) => l.toStatus === txn.status);
  if (event === "payment.failed") {
    return {
      ...base,
      failure_reason: finalLog?.description ?? null,
      failed_at: (finalLog?.createdAt ?? txn.updatedAt).toISOString(),
    };
  }
  return {
    ...base,
    expired_at: (txn.expiredAt ?? finalLog?.createdAt ?? txn.updatedAt).toISOString(),
  };
}

// ─── Outbox dispatch ──────────────────────────────────────────────────────────

/** Fields to set in the same DB transaction as a final status change. */
export const OUTBOX_PENDING = { notifyWebhook: true, webhookSentAt: null } as const;

/**
 * Claim and enqueue webhooks for a transaction whose outbox flag is set. Safe to call any number
 * of times and from any process: only the caller whose conditional UPDATE wins enqueues.
 * Returns the number of jobs enqueued.
 */
export async function dispatchTransactionWebhook(transactionId: number): Promise<number> {
  const prisma = getPrisma();
  const claimedAt = new Date();
  const { count } = await prisma.transaction.updateMany({
    where: { id: transactionId, notifyWebhook: true, webhookSentAt: null },
    data: { webhookSentAt: claimedAt },
  });
  if (count === 0) return 0;

  try {
    const txn = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { partnerConfig: { select: { connectorType: true } }, logs: true },
    });
    const event = txn ? STATUS_EVENT[txn.status] : undefined;
    if (!txn || !event) return 0;

    return await enqueueForTransaction(
      txn,
      event,
      deliveryIdFor(txn.txnCode, event),
      JSON.stringify(buildTransactionPayload(txn, event)),
    );
  } catch (e) {
    // Release the claim so the sweeper retries the dispatch.
    await prisma.transaction
      .updateMany({
        where: { id: transactionId, webhookSentAt: claimedAt },
        data: { webhookSentAt: null },
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * Enqueue one job per active endpoint of the transaction's merchant subscribed to `event`.
 * transactions.webhook_url overrides the endpoint URL (API-Design §5.1); it is signed with the
 * secret of the merchant's first subscribed endpoint. No endpoint → `webhook_skipped` log.
 */
async function enqueueForTransaction(
  txn: { id: number; merchantId: number; status: string; webhookUrl: string | null },
  event: WebhookEvent,
  deliveryId: string,
  body: string,
): Promise<number> {
  const prisma = getPrisma();
  const configs = await prisma.webhookConfig.findMany({
    where: { merchantId: txn.merchantId, status: "Active" },
    orderBy: { id: "asc" },
  });
  const subscribed = configs.filter((c) => eventsOf(c).includes(event));
  const targets = txn.webhookUrl
    ? subscribed.slice(0, 1).map((c) => ({ config: c, url: txn.webhookUrl! }))
    : subscribed.map((c) => ({ config: c, url: c.url }));

  if (targets.length === 0) {
    await prisma.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: "webhook_skipped",
        fromStatus: txn.status,
        toStatus: txn.status,
        description: `No active webhook endpoint subscribed to ${event}`,
        createdBy: "system:webhook",
      },
    });
    return 0;
  }

  for (const { config, url } of targets) {
    await enqueueWebhook(
      {
        deliveryId,
        webhookConfigId: config.id,
        url,
        event,
        transactionId: txn.id,
        body,
        retryIntervals: intervalsOf(config),
      },
      config.retryCount,
    );
  }
  return targets.length;
}

/** Fire-and-forget dispatch after a commit; the sweeper covers failures. */
export function dispatchSoon(transactionId: number): void {
  void dispatchTransactionWebhook(transactionId).catch((e: unknown) =>
    console.error(`[webhook] dispatch #${transactionId} deferred: ${(e as Error).message}`),
  );
}

/** Re-dispatch outbox rows nobody claimed (called by the worker every 30 s). */
export async function sweepWebhookOutbox(minAgeMs = 10_000): Promise<number> {
  const before = new Date(Date.now() - minAgeMs);
  const prisma = getPrisma();
  const [rows, refunds, disputes] = await Promise.all([
    prisma.transaction.findMany({
      where: { notifyWebhook: true, webhookSentAt: null, updatedAt: { lte: before } },
      select: { id: true },
      take: 200,
    }),
    prisma.refund.findMany({
      where: { notifyWebhook: true, webhookSentAt: null, updatedAt: { lte: before } },
      select: { id: true },
      take: 200,
    }),
    prisma.dispute.findMany({
      where: { notifyWebhook: true, webhookSentAt: null, updatedAt: { lte: before } },
      select: { id: true },
      take: 200,
    }),
  ]);
  let enqueued = 0;
  for (const r of rows) enqueued += await dispatchTransactionWebhook(r.id).catch(() => 0);
  for (const r of refunds) enqueued += await dispatchRefundWebhook(r.id).catch(() => 0);
  for (const d of disputes) enqueued += await dispatchDisputeWebhook(d.id).catch(() => 0);
  return enqueued;
}

// ─── Refund outbox (P5.3) ─────────────────────────────────────────────────────

type RefundForPayload = Prisma.RefundGetPayload<{
  include: {
    transaction: { include: { partnerConfig: { select: { connectorType: true } } } };
  };
}>;

/** refund.completed payload (API-Design §7.2) + the transaction's totals after this refund. */
export function buildRefundPayload(refund: RefundForPayload) {
  const txn = refund.transaction;
  return {
    event: "refund.completed" as const,
    transaction_id: txn.txnCode,
    merchant_txn_id: txn.merchantTxnId,
    refund_code: refund.refundCode,
    amount: Number(refund.amount),
    currency: txn.currency,
    reason: refund.reason,
    partner: txn.partnerConfig?.connectorType ?? null,
    partner_refund_id: refund.partnerRefundId,
    refunded_at: (refund.processedAt ?? refund.updatedAt).toISOString(),
    transaction_amount: Number(txn.amount),
    total_refunded: Number(txn.refundedAmount),
    transaction_status: txn.status,
  };
}

/**
 * Claim and enqueue the refund.completed webhook of a refund whose outbox flag is set (set in the
 * same DB transaction that completed the refund). Same claim semantics as transactions.
 */
export async function dispatchRefundWebhook(refundId: number): Promise<number> {
  const prisma = getPrisma();
  const claimedAt = new Date();
  const { count } = await prisma.refund.updateMany({
    where: { id: refundId, notifyWebhook: true, webhookSentAt: null },
    data: { webhookSentAt: claimedAt },
  });
  if (count === 0) return 0;
  try {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        transaction: { include: { partnerConfig: { select: { connectorType: true } } } },
      },
    });
    if (!refund || refund.status !== "Completed") return 0;
    const event: WebhookEvent = "refund.completed";
    return await enqueueForTransaction(
      refund.transaction,
      event,
      deliveryIdFor(refund.refundCode, event),
      JSON.stringify(buildRefundPayload(refund)),
    );
  } catch (e) {
    await prisma.refund
      .updateMany({
        where: { id: refundId, webhookSentAt: claimedAt },
        data: { webhookSentAt: null },
      })
      .catch(() => {});
    throw e;
  }
}

export function dispatchRefundSoon(refundId: number): void {
  void dispatchRefundWebhook(refundId).catch((e: unknown) =>
    console.error(`[webhook] refund #${refundId} dispatch deferred: ${(e as Error).message}`),
  );
}

// ─── Dispute outbox (P5.6) ────────────────────────────────────────────────────

type DisputeForPayload = Prisma.DisputeGetPayload<{
  include: {
    transaction: { include: { partnerConfig: { select: { connectorType: true } } } };
  };
}>;

/** dispute.resolved payload (API-Design §7.2): the result of a dispute (Resolved / Rejected). */
export function buildDisputePayload(d: DisputeForPayload) {
  const txn = d.transaction;
  return {
    event: "dispute.resolved" as const,
    dispute_code: d.disputeCode,
    transaction_id: txn.txnCode,
    merchant_txn_id: txn.merchantTxnId,
    amount: Number(txn.amount),
    currency: txn.currency,
    partner: txn.partnerConfig?.connectorType ?? null,
    status: d.status,
    reason: d.reason,
    resolution: d.resolution,
    partner_ref: d.partnerRef,
    created_at: d.createdAt.toISOString(),
    resolved_at: (d.resolvedAt ?? d.updatedAt).toISOString(),
    transaction_status: txn.status,
  };
}

/** Claim and enqueue the dispute.resolved webhook of a dispute whose outbox flag is set. */
export async function dispatchDisputeWebhook(disputeId: number): Promise<number> {
  const prisma = getPrisma();
  const claimedAt = new Date();
  const { count } = await prisma.dispute.updateMany({
    where: { id: disputeId, notifyWebhook: true, webhookSentAt: null },
    data: { webhookSentAt: claimedAt },
  });
  if (count === 0) return 0;
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        transaction: { include: { partnerConfig: { select: { connectorType: true } } } },
      },
    });
    if (!dispute || (dispute.status !== "Resolved" && dispute.status !== "Rejected")) return 0;
    const event: WebhookEvent = "dispute.resolved";
    return await enqueueForTransaction(
      dispute.transaction,
      event,
      deliveryIdFor(dispute.disputeCode, event),
      JSON.stringify(buildDisputePayload(dispute)),
    );
  } catch (e) {
    await prisma.dispute
      .updateMany({
        where: { id: disputeId, webhookSentAt: claimedAt },
        data: { webhookSentAt: null },
      })
      .catch(() => {});
    throw e;
  }
}

export function dispatchDisputeSoon(disputeId: number): void {
  void dispatchDisputeWebhook(disputeId).catch((e: unknown) =>
    console.error(`[webhook] dispute #${disputeId} dispatch deferred: ${(e as Error).message}`),
  );
}

// ─── Attempt logging ──────────────────────────────────────────────────────────

export interface AttemptContext {
  deliveryId: string;
  webhookConfigId: number | null;
  transactionId: number | null;
  event: string;
  url: string;
  body: string;
  attempt: number;
  maxRetries: number;
  nextRetryAt: Date | null;
}

export async function recordAttempt(ctx: AttemptContext, res: SendResult): Promise<bigint> {
  let requestBody: unknown;
  try {
    requestBody = JSON.parse(ctx.body);
  } catch {
    requestBody = ctx.body;
  }
  const row = await getPrisma().webhookLog.create({
    data: {
      deliveryId: ctx.deliveryId,
      webhookConfigId: ctx.webhookConfigId,
      transactionId: ctx.transactionId,
      event: ctx.event,
      requestUrl: ctx.url.slice(0, 500),
      requestHeaders: res.requestHeaders as Prisma.InputJsonValue,
      requestBody: requestBody as Prisma.InputJsonValue,
      responseStatus: res.status,
      responseBody: res.responseBody,
      responseHeaders: (res.responseHeaders ?? undefined) as Prisma.InputJsonValue | undefined,
      status: res.ok ? "Success" : "Failed",
      attempt: ctx.attempt,
      maxRetries: ctx.maxRetries,
      nextRetryAt: res.ok ? null : ctx.nextRetryAt,
      durationMs: res.durationMs,
      errorMessage: res.error,
    },
  });
  if (
    res.ok &&
    ctx.transactionId &&
    (ctx.event.startsWith("payment.") ||
      ctx.event.startsWith("refund.") ||
      ctx.event.startsWith("dispute."))
  ) {
    await getPrisma()
      .transactionLog.create({
        data: {
          transactionId: ctx.transactionId,
          event: "webhook_delivered",
          description: `${ctx.event} → ${ctx.url} (HTTP ${res.status}, attempt ${ctx.attempt})`,
          createdBy: "system:webhook",
        },
      })
      .catch(() => {});
  }
  return row.id;
}

// ─── Config CRUD ──────────────────────────────────────────────────────────────

export interface Scope {
  /** Admin token bound to one merchant → only that merchant's endpoints and logs. */
  merchantId?: number;
}

export interface WebhookConfigInput {
  merchantId: number;
  url: string;
  events: WebhookEvent[];
  retryCount: number;
  retryIntervals: number[];
  timeoutMs: number;
}

function secretHint(stored: string): string {
  try {
    const plain = decryptSecret(stored);
    return `${plain.slice(0, 6)}••••${plain.slice(-4)}`;
  } catch {
    return "••••";
  }
}

async function statsByConfig(ids: number[]) {
  if (ids.length === 0)
    return new Map<number, { total: number; success: number; failed: number }>();
  const rows = await getPrisma().webhookLog.groupBy({
    by: ["webhookConfigId", "status"],
    where: { webhookConfigId: { in: ids } },
    _count: { _all: true },
  });
  const map = new Map<number, { total: number; success: number; failed: number }>();
  for (const r of rows) {
    const id = r.webhookConfigId!;
    const s = map.get(id) ?? { total: 0, success: 0, failed: 0 };
    s.total += r._count._all;
    if (r.status === "Success") s.success += r._count._all;
    else s.failed += r._count._all;
    map.set(id, s);
  }
  return map;
}

type ConfigWithMerchant = WebhookConfig & { merchant: { code: string } };

function toConfigView(
  c: ConfigWithMerchant,
  stats?: { total: number; success: number; failed: number },
): WebhookConfigView {
  return {
    id: c.id,
    merchantId: c.merchantId,
    merchantCode: c.merchant.code,
    url: c.url,
    events: eventsOf(c),
    status: c.status,
    retryCount: c.retryCount,
    retryIntervals: intervalsOf(c),
    timeoutMs: c.timeoutMs,
    secretHint: secretHint(c.secret),
    stats: stats ?? { total: 0, success: 0, failed: 0 },
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function listWebhookConfigs(
  scope: Scope,
  filter: { status?: "Active" | "Inactive" } = {},
): Promise<WebhookConfigView[]> {
  const rows = await getPrisma().webhookConfig.findMany({
    where: { merchantId: scope.merchantId, status: filter.status },
    include: { merchant: { select: { code: true } } },
    orderBy: { id: "asc" },
  });
  const stats = await statsByConfig(rows.map((r) => r.id));
  return rows.map((r) => toConfigView(r, stats.get(r.id)));
}

async function loadConfig(id: number, scope: Scope): Promise<ConfigWithMerchant> {
  const c = await getPrisma().webhookConfig.findFirst({
    where: { id, merchantId: scope.merchantId },
    include: { merchant: { select: { code: true } } },
  });
  if (!c) throw new WebhookError("NOT_FOUND", "Không tìm thấy webhook endpoint");
  return c;
}

export async function getWebhookConfig(id: number, scope: Scope): Promise<WebhookConfigView> {
  const c = await loadConfig(id, scope);
  return toConfigView(c, (await statsByConfig([id])).get(id));
}

async function assertMerchant(merchantId: number, scope: Scope): Promise<void> {
  if (scope.merchantId !== undefined && scope.merchantId !== merchantId) {
    throw new WebhookError("NOT_FOUND", "Merchant không tồn tại");
  }
  const m = await getPrisma().merchant.findUnique({ where: { id: merchantId } });
  if (!m) throw new WebhookError("VALIDATION_ERROR", "Merchant không tồn tại");
}

export async function createWebhookConfig(
  input: WebhookConfigInput,
  scope: Scope,
): Promise<{ config: WebhookConfigView; secret: string }> {
  await assertMerchant(input.merchantId, scope);
  const secret = generateWebhookSecret();
  const row = await getPrisma().webhookConfig.create({
    data: {
      merchantId: input.merchantId,
      url: input.url,
      secret: encryptSecret(secret),
      events: input.events,
      status: "Active",
      retryCount: input.retryCount,
      retryIntervals: input.retryIntervals,
      timeoutMs: input.timeoutMs,
    },
    include: { merchant: { select: { code: true } } },
  });
  return { config: toConfigView(row), secret };
}

export async function updateWebhookConfig(
  id: number,
  input: Omit<WebhookConfigInput, "merchantId">,
  scope: Scope,
): Promise<WebhookConfigView> {
  await loadConfig(id, scope);
  const row = await getPrisma().webhookConfig.update({
    where: { id },
    data: {
      url: input.url,
      events: input.events,
      retryCount: input.retryCount,
      retryIntervals: input.retryIntervals,
      timeoutMs: input.timeoutMs,
    },
    include: { merchant: { select: { code: true } } },
  });
  return toConfigView(row, (await statsByConfig([id])).get(id));
}

export async function setWebhookStatus(
  id: number,
  status: "Active" | "Inactive",
  scope: Scope,
): Promise<WebhookConfigView> {
  await loadConfig(id, scope);
  const row = await getPrisma().webhookConfig.update({
    where: { id },
    data: { status },
    include: { merchant: { select: { code: true } } },
  });
  return toConfigView(row, (await statsByConfig([id])).get(id));
}

export async function rotateWebhookSecret(
  id: number,
  scope: Scope,
): Promise<{ config: WebhookConfigView; secret: string }> {
  await loadConfig(id, scope);
  const secret = generateWebhookSecret();
  const row = await getPrisma().webhookConfig.update({
    where: { id },
    data: { secret: encryptSecret(secret) },
    include: { merchant: { select: { code: true } } },
  });
  return { config: toConfigView(row, (await statsByConfig([id])).get(id)), secret };
}

/** Deleting keeps the delivery history (webhook_logs.webhook_config_id → NULL). */
export async function deleteWebhookConfig(id: number, scope: Scope): Promise<void> {
  await loadConfig(id, scope);
  await getPrisma().webhookConfig.delete({ where: { id } });
}

// ─── Manual sends: ping & replay ──────────────────────────────────────────────

export interface ManualSendResult {
  logId: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
}

export async function pingWebhook(id: number, scope: Scope): Promise<ManualSendResult> {
  const c = await loadConfig(id, scope);
  const deliveryId = randomUUID();
  const body = JSON.stringify({
    event: PING_EVENT,
    webhook_id: c.id,
    merchant_code: c.merchant.code,
    message: "Ping từ BizOne Payment Hub",
    sent_at: new Date().toISOString(),
  });
  const res = await sendWebhook({
    url: c.url,
    secret: decryptSecret(c.secret),
    event: PING_EVENT,
    deliveryId,
    body,
    timeoutMs: Math.min(c.timeoutMs, 15_000),
  });
  const logId = await recordAttempt(
    {
      deliveryId,
      webhookConfigId: c.id,
      transactionId: null,
      event: PING_EVENT,
      url: c.url,
      body,
      attempt: 1,
      maxRetries: 0,
      nextRetryAt: null,
    },
    res,
  );
  return {
    logId: logId.toString(),
    ok: res.ok,
    status: res.status,
    durationMs: res.durationMs,
    error: res.error,
  };
}

/**
 * Re-send a logged message now (same X-Webhook-Id, same body, current secret of its endpoint).
 * One synchronous attempt — the admin sees the result immediately.
 */
export async function replayWebhook(logId: bigint, scope: Scope): Promise<ManualSendResult> {
  const prisma = getPrisma();
  const log = await prisma.webhookLog.findUnique({
    where: { id: logId },
    include: { webhookConfig: { include: { merchant: { select: { code: true } } } } },
  });
  if (
    !log ||
    (scope.merchantId !== undefined && log.webhookConfig?.merchantId !== scope.merchantId)
  ) {
    throw new WebhookError("NOT_FOUND", "Không tìm thấy lịch sử webhook");
  }
  if (!log.webhookConfig) {
    throw new WebhookError(
      "CONFLICT",
      "Endpoint của webhook này đã bị xoá — không có secret để ký",
    );
  }
  if (!log.requestUrl || log.requestBody === null) {
    throw new WebhookError("CONFLICT", "Bản ghi không có request để gửi lại");
  }
  const body = JSON.stringify(log.requestBody);
  const deliveryId = log.deliveryId ?? randomUUID();
  const last = await prisma.webhookLog.aggregate({
    where: { deliveryId, webhookConfigId: log.webhookConfigId },
    _max: { attempt: true },
  });
  const res = await sendWebhook({
    url: log.requestUrl,
    secret: decryptSecret(log.webhookConfig.secret),
    event: log.event,
    deliveryId,
    body,
    timeoutMs: Math.min(log.webhookConfig.timeoutMs, 15_000),
  });
  const newId = await recordAttempt(
    {
      deliveryId,
      webhookConfigId: log.webhookConfigId,
      transactionId: log.transactionId,
      event: log.event,
      url: log.requestUrl,
      body,
      attempt: (last._max.attempt ?? log.attempt) + 1,
      maxRetries: log.maxRetries,
      nextRetryAt: null,
    },
    res,
  );
  return {
    logId: newId.toString(),
    ok: res.ok,
    status: res.status,
    durationMs: res.durationMs,
    error: res.error,
  };
}

// ─── History & stats ──────────────────────────────────────────────────────────

export interface LogFilter {
  webhookConfigId?: number;
  transaction?: string;
  event?: string;
  status?: "Success" | "Failed";
  url?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
}

type LogRow = Prisma.WebhookLogGetPayload<{
  include: { transaction: { select: { txnCode: true } } };
}>;

function toLogView(r: LogRow): WebhookLogView {
  return {
    id: r.id.toString(),
    deliveryId: r.deliveryId,
    webhookConfigId: r.webhookConfigId,
    transactionId: r.transactionId,
    txnCode: r.transaction?.txnCode ?? null,
    event: r.event,
    requestUrl: r.requestUrl,
    responseStatus: r.responseStatus,
    status: r.status,
    attempt: r.attempt,
    maxRetries: r.maxRetries,
    nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
  };
}

function scopeWhere(scope: Scope): Prisma.WebhookLogWhereInput {
  return scope.merchantId !== undefined ? { webhookConfig: { merchantId: scope.merchantId } } : {};
}

export async function listWebhookLogs(filter: LogFilter, scope: Scope) {
  const prisma = getPrisma();
  const txnRef = filter.transaction?.trim();
  const where: Prisma.WebhookLogWhereInput = {
    ...scopeWhere(scope),
    webhookConfigId: filter.webhookConfigId,
    event: filter.event,
    status: filter.status,
    requestUrl: filter.url ? { contains: filter.url } : undefined,
    createdAt:
      filter.dateFrom || filter.dateTo ? { gte: filter.dateFrom, lte: filter.dateTo } : undefined,
    ...(txnRef
      ? /^\d+$/.test(txnRef)
        ? { transactionId: Number(txnRef) }
        : { transaction: { txnCode: { contains: txnRef } } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      include: { transaction: { select: { txnCode: true } } },
      orderBy: { id: "desc" },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.webhookLog.count({ where }),
  ]);
  return {
    items: rows.map(toLogView),
    meta: {
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.limit)),
    },
  };
}

export async function getWebhookLog(id: bigint, scope: Scope): Promise<WebhookLogDetail> {
  const r = await getPrisma().webhookLog.findFirst({
    where: { id, ...scopeWhere(scope) },
    include: { transaction: { select: { txnCode: true } } },
  });
  if (!r) throw new WebhookError("NOT_FOUND", "Không tìm thấy lịch sử webhook");
  return {
    ...toLogView(r),
    requestHeaders: r.requestHeaders as Record<string, string> | null,
    requestBody: r.requestBody,
    responseHeaders: r.responseHeaders as Record<string, string> | null,
    responseBody: r.responseBody,
  };
}

export async function webhookStats(periodHours: number, scope: Scope): Promise<WebhookStats> {
  const prisma = getPrisma();
  const where: Prisma.WebhookLogWhereInput = {
    ...scopeWhere(scope),
    createdAt: { gte: new Date(Date.now() - periodHours * 3600_000) },
  };
  const [byStatus, agg, pendingOutbox] = await Promise.all([
    prisma.webhookLog.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.webhookLog.aggregate({ where, _avg: { durationMs: true }, _max: { durationMs: true } }),
    prisma.transaction.count({
      where: {
        notifyWebhook: true,
        webhookSentAt: null,
        merchantId: scope.merchantId,
      },
    }),
  ]);
  const success = byStatus.find((s) => s.status === "Success")?._count._all ?? 0;
  const failed = byStatus.find((s) => s.status === "Failed")?._count._all ?? 0;
  let pendingRetries = 0;
  try {
    pendingRetries = await getWebhookQueue().getJobCountByTypes("delayed", "waiting", "active");
  } catch {
    // Redis unavailable — stats still render
  }
  const attempts = success + failed;
  return {
    periodHours,
    attempts,
    success,
    failed,
    successRate: attempts ? Math.round((success / attempts) * 1000) / 10 : null,
    avgDurationMs: agg._avg.durationMs === null ? null : Math.round(agg._avg.durationMs),
    maxDurationMs: agg._max.durationMs,
    pendingRetries,
    pendingOutbox,
  };
}

export { DEFAULT_RETRY_COUNT, DEFAULT_RETRY_INTERVALS };
