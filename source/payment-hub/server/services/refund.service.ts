import { randomInt } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma, type Refund } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  checkRefundAmount,
  evaluateRefund,
  formatRefundCode,
  refundCheckDelayMs,
  statusAfterRefund,
  type RefundEligibility,
  type RefundErrorCode,
  type RefundOutcomeView,
  type RefundView,
} from "@/lib/refund";
import {
  ConnectorUnavailableError,
  asyncRefundConnectorTypes,
  connectorFromPartnerConfig,
  definitionForConnectorType,
  refundCapability,
} from "@/services/connectors/registry";
import type { RefundResult } from "@/services/connectors/types";
import { getLatestPartnerRequest } from "./payment.service";
import { assertTransition, type TxnStatus } from "./stateMachine";
import { dispatchRefundSoon } from "./webhook.service";

/**
 * Refund module (P5.3, SRS-PH-REFUND-01/02, API-Design §5.1 / §8.2).
 *
 * requestRefund:
 *   1. checks (lib/refund.ts) and builds the partner's connector;
 *   2. under a row lock on the transaction re-checks and inserts the refund as `Processing` — the
 *      amount is reserved, so concurrent requests can never exceed the paid amount;
 *   3. calls the PSP outside any DB transaction;
 *   4. applies the answer: Completed (refunded_amount += amount, transaction → PartiallyRefunded /
 *      Refunded, refund.completed webhook via the refund outbox), Failed (reservation released), or
 *      still Processing (PSP processing asynchronously, or no trustworthy answer — timeout, HTTP 5xx,
 *      unverifiable "success"). Processing refunds are polled when the connector has queryRefund
 *      (ZaloPay, syncPendingRefunds) or confirmed manually by an admin (resolveRefund).
 */

export class RefundError extends Error {
  constructor(
    public readonly code: RefundErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

const INFLIGHT: Refund["status"][] = ["Pending", "Processing"];
const OUTBOX_PENDING = { notifyWebhook: true, webhookSentAt: null } as const;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function refundCode(now: Date): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return formatRefundCode(now, suffix);
}

export interface RefundActor {
  channel: "Merchant" | "Admin";
  /** `merchant:{id}` or the admin token username — logged and sent to the PSP (vnp_CreateBy) */
  requestedBy: string;
  /** Scope: merchant API key / merchant-bound admin token only sees its merchant */
  merchantId?: number;
  ipAddress?: string;
}

export interface RefundInput {
  /** omitted / null = everything still refundable */
  amount?: number | null;
  reason: string;
  /** Admin-only internal note */
  note?: string | null;
}

// ─── Views ────────────────────────────────────────────────────────────────────

export type { RefundOutcomeView, RefundView };

type RefundWithTxn = Refund & { transaction: { txnCode: string; currency: string } };

export function toRefundView(
  r: RefundWithTxn,
  opts: { admin?: boolean; asyncPartner?: boolean } = {},
): RefundView {
  return {
    id: r.id,
    refund_code: r.refundCode,
    transaction_id: r.transaction.txnCode,
    amount: Number(r.amount),
    currency: r.transaction.currency,
    status: r.status,
    reason: r.reason,
    partner_refund_id: r.partnerRefundId,
    response_code: r.responseCode,
    message: r.errorMessage,
    channel: r.channel,
    processed_at: r.processedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
    ...(opts.admin
      ? {
          requested_by: r.requestedBy,
          internal_note: r.internalNote,
          check_count: r.checkCount,
          last_checked_at: r.lastCheckedAt?.toISOString() ?? null,
          // Processing with no way to ask the PSP → an operator must confirm on the partner portal
          manual_check: r.status === "Processing" && !(opts.asyncPartner && r.partnerRefundRef),
        }
      : {}),
  };
}

// ─── Loading ──────────────────────────────────────────────────────────────────

const TXN_INCLUDE = { partnerConfig: true } as const;
type TxnWithPartner = Prisma.TransactionGetPayload<{ include: typeof TXN_INCLUDE }>;

async function findTxn(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  ref: string | number,
  merchantId?: number,
): Promise<TxnWithPartner | null> {
  const asNumber = typeof ref === "number" ? ref : /^\d+$/.test(ref) ? Number(ref) : null;
  const txn = await db.transaction.findUnique({
    where: asNumber !== null ? { id: asNumber } : { txnCode: String(ref) },
    include: TXN_INCLUDE,
  });
  if (!txn || (merchantId !== undefined && txn.merchantId !== merchantId)) return null;
  return txn;
}

async function inflightAmount(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  transactionId: number,
): Promise<number> {
  const agg = await db.refund.aggregate({
    where: { transactionId, status: { in: INFLIGHT } },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

function eligibilityOf(txn: TxnWithPartner, inflight: number, now = new Date()) {
  const connectorType = txn.partnerConfig?.connectorType ?? null;
  return evaluateRefund(
    {
      status: txn.status,
      amount: Number(txn.amount),
      refundedAmount: Number(txn.refundedAmount),
      inflightAmount: inflight,
      paidAt: txn.paidAt,
      partner: connectorType ?? (txn.paymentMethod === "vietqr" ? "VietQR" : null),
      partnerTxnId: txn.partnerTxnId,
      capability: refundCapability(connectorType),
    },
    now,
  );
}

/** Eligibility + refund history of a transaction (admin detail page / API). */
export async function getRefundOverview(
  ref: string | number,
  merchantId?: number,
): Promise<{ eligibility: RefundEligibility; refunds: RefundView[] } | null> {
  const prisma = getPrisma();
  const txn = await findTxn(prisma, ref, merchantId);
  if (!txn) return null;
  const [inflight, rows] = await Promise.all([
    inflightAmount(prisma, txn.id),
    prisma.refund.findMany({ where: { transactionId: txn.id }, orderBy: { id: "desc" } }),
  ]);
  const asyncPartner = !!refundCapability(txn.partnerConfig?.connectorType)?.async;
  return {
    eligibility: eligibilityOf(txn, inflight),
    refunds: rows.map((r) =>
      toRefundView({ ...r, transaction: txn }, { admin: true, asyncPartner }),
    ),
  };
}

/** Refunds of a transaction for the merchant API (no internal fields). */
export async function listRefundsForMerchant(transactionId: number): Promise<RefundView[]> {
  const rows = await getPrisma().refund.findMany({
    where: { transactionId },
    include: { transaction: { select: { txnCode: true, currency: true } } },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => toRefundView(r));
}

// ─── Request ──────────────────────────────────────────────────────────────────

export async function requestRefund(
  txnRef: string | number,
  input: RefundInput,
  actor: RefundActor,
): Promise<RefundOutcomeView> {
  const prisma = getPrisma();
  const txn = await findTxn(prisma, txnRef, actor.merchantId);
  if (!txn) throw new RefundError("NOT_FOUND", "Không tìm thấy giao dịch");

  // Cheap checks first, so the merchant gets the real reason before anything is reserved.
  const pre = checkRefundAmount(
    eligibilityOf(txn, await inflightAmount(prisma, txn.id)),
    input.amount,
  );
  if (!pre.ok) throw new RefundError(pre.code, pre.reason, pre.details);

  const pc = txn.partnerConfig!;
  const def = definitionForConnectorType(pc.connectorType)!;
  let connector;
  try {
    connector = connectorFromPartnerConfig(pc).connector;
  } catch (e) {
    if (e instanceof ConnectorUnavailableError) {
      throw new RefundError(
        "SERVICE_UNAVAILABLE",
        "Cấu hình đối tác của giao dịch không dùng được",
      );
    }
    throw e;
  }
  const sent = await getLatestPartnerRequest(txn.id, def.code);

  // Reserve under a row lock: every refund of this transaction is serialised here.
  let reserved: { refund: Refund; type: "full" | "partial" } | undefined;
  for (let i = 0; i < 3 && !reserved; i++) {
    try {
      reserved = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${txn.id} FOR UPDATE`;
        const fresh = (await findTxn(tx, txn.id))!;
        const check = checkRefundAmount(
          eligibilityOf(fresh, await inflightAmount(tx, txn.id)),
          input.amount,
        );
        if (!check.ok) throw new RefundError(check.code, check.reason, check.details);
        const refund = await tx.refund.create({
          data: {
            transactionId: txn.id,
            refundCode: refundCode(new Date()),
            amount: check.amount,
            reason: input.reason,
            internalNote: input.note || null,
            status: "Processing",
            requestedBy: actor.requestedBy.slice(0, 100),
            channel: actor.channel,
          },
        });
        await tx.transactionLog.create({
          data: {
            transactionId: txn.id,
            event: "refund_requested",
            fromStatus: fresh.status,
            toStatus: fresh.status,
            description: `Yêu cầu hoàn tiền ${refund.refundCode}: ${check.amount.toLocaleString("vi-VN")} ₫ (${check.type === "full" ? "toàn phần" : "một phần"}) qua ${pc.connectorType} — ${input.reason}`,
            createdBy: actor.requestedBy,
          },
        });
        return { refund, type: check.type };
      });
    } catch (e) {
      // refund_code collision (32^6 codes per day) → new code
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  if (!reserved) throw new Error("Could not allocate a refund code");
  const { refund, type } = reserved;

  let result: RefundResult | undefined;
  let thrown: unknown;
  try {
    result = await connector.refund({
      txnCode: txn.txnCode,
      amount: Number(refund.amount),
      type,
      partnerTxnId: txn.partnerTxnId ?? undefined,
      transactionDate: sent?.vnp_CreateDate ?? "",
      reason: input.reason,
      createdBy: actor.requestedBy.slice(0, 50),
      ipAddress: actor.ipAddress ?? "127.0.0.1",
    });
  } catch (e) {
    thrown = e;
  }

  await applyRefundOutcome(refund.id, outcomeOf(result, thrown, pc.connectorType), {
    createdBy: `system:refund`,
    rawRequest: result?.partnerRequest,
    first: true,
  });
  return refundOutcome(refund.id);
}

// ─── Outcome ──────────────────────────────────────────────────────────────────

export type RefundOutcome =
  | {
      kind: "completed";
      partnerRefundId?: string;
      responseCode?: string;
      message?: string;
      raw?: unknown;
    }
  | { kind: "failed"; responseCode?: string; message: string; raw?: unknown }
  | {
      kind: "processing";
      partnerRefundRef?: string;
      partnerRefundId?: string;
      responseCode?: string;
      message: string;
      raw?: unknown;
    };

export function outcomeOf(
  result: RefundResult | undefined,
  thrown: unknown,
  partner: string,
): RefundOutcome {
  if (!result) {
    const why = thrown instanceof Error ? thrown.message : String(thrown ?? "no response");
    return {
      kind: "processing",
      responseCode: "NO_RESPONSE",
      message: `Không nhận được phản hồi từ ${partner} (${why}) — kiểm tra trên cổng đối tác rồi xác nhận`,
    };
  }
  const message = result.message || result.responseCode;
  if (result.success) {
    return {
      kind: "completed",
      partnerRefundId: result.partnerRefundId,
      responseCode: result.responseCode,
      message: result.message,
      raw: result.partnerRaw,
    };
  }
  if (result.pending) {
    return {
      kind: "processing",
      partnerRefundRef: result.partnerRefundRef,
      partnerRefundId: result.partnerRefundId,
      responseCode: result.responseCode,
      message: `${partner} chưa xác nhận kết quả (${result.responseCode}: ${message})`,
      raw: result.partnerRaw,
    };
  }
  return {
    kind: "failed",
    responseCode: result.responseCode,
    message: `${partner} từ chối hoàn tiền (${result.responseCode}: ${message})`,
    raw: result.partnerRaw,
  };
}

function json(v: unknown): Prisma.InputJsonValue | undefined {
  return v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue);
}

/**
 * Apply a PSP answer (or a manual confirmation) to a Processing refund. Only a Processing refund
 * changes (conditional UPDATE under the transaction's row lock) → idempotent, race-safe between
 * the request, the poller and an admin.
 */
export async function applyRefundOutcome(
  refundId: number,
  outcome: RefundOutcome,
  opts: { createdBy: string; rawRequest?: unknown; first?: boolean },
): Promise<"applied" | "unchanged"> {
  const prisma = getPrisma();
  const base = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!base || base.status !== "Processing") return "unchanged";
  const now = new Date();
  const common = {
    responseCode: outcome.responseCode?.slice(0, 50) ?? base.responseCode,
    ...(opts.rawRequest !== undefined ? { rawRequest: json(opts.rawRequest) } : {}),
    ...(outcome.raw !== undefined ? { rawResponse: json(outcome.raw) } : {}),
  };

  if (outcome.kind === "processing") {
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        ...common,
        errorMessage: outcome.message,
        partnerRefundRef: outcome.partnerRefundRef ?? base.partnerRefundRef,
        partnerRefundId: outcome.partnerRefundId ?? base.partnerRefundId,
      },
    });
    if (opts.first) {
      await prisma.transactionLog.create({
        data: {
          transactionId: base.transactionId,
          event: "refund_processing",
          description: `Hoàn tiền ${base.refundCode} đang chờ đối tác xác nhận — ${outcome.message}`,
          createdBy: opts.createdBy,
        },
      });
    }
    return "applied";
  }

  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${base.transactionId} FOR UPDATE`;
    const { count } = await tx.refund.updateMany({
      where: { id: refundId, status: "Processing" },
      data:
        outcome.kind === "completed"
          ? {
              ...common,
              status: "Completed",
              partnerRefundId: outcome.partnerRefundId ?? base.partnerRefundId,
              errorMessage: null,
              processedAt: now,
              ...OUTBOX_PENDING, // refund.completed webhook
            }
          : { ...common, status: "Failed", errorMessage: outcome.message, processedAt: now },
    });
    if (count === 0) return null;
    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: base.transactionId } });
    const amount = Number(base.amount);

    if (outcome.kind === "failed") {
      await tx.transactionLog.create({
        data: {
          transactionId: txn.id,
          event: "refund_failed",
          fromStatus: txn.status,
          toStatus: txn.status,
          description: `Hoàn tiền ${base.refundCode} (${amount.toLocaleString("vi-VN")} ₫) thất bại — ${outcome.message}`,
          rawData: json(outcome.raw),
          createdBy: opts.createdBy,
        },
      });
      return { txn, toStatus: txn.status, changed: false };
    }

    const refunded = Number(txn.refundedAmount) + amount;
    const toStatus = statusAfterRefund(Number(txn.amount), refunded);
    if (toStatus !== txn.status) assertTransition(txn.status as TxnStatus, toStatus);
    await tx.transaction.update({
      where: { id: txn.id },
      data: { refundedAmount: refunded, status: toStatus },
    });
    await tx.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: "refund_completed",
        fromStatus: txn.status,
        toStatus,
        description: `Hoàn tiền ${base.refundCode} thành công: ${amount.toLocaleString("vi-VN")} ₫${outcome.partnerRefundId ? ` (mã đối tác ${outcome.partnerRefundId})` : ""} — đã hoàn ${refunded.toLocaleString("vi-VN")}/${Number(txn.amount).toLocaleString("vi-VN")} ₫${outcome.message && opts.createdBy !== "system:refund" ? ` — ${outcome.message}` : ""}`,
        rawData: json(outcome.raw),
        createdBy: opts.createdBy,
      },
    });
    return { txn, toStatus, changed: toStatus !== txn.status };
  });
  if (!res) return "unchanged";

  if (outcome.kind === "completed") {
    if (res.changed) {
      void publishEvent("transaction.status_changed", {
        txnId: res.txn.id,
        merchantId: res.txn.merchantId,
        txnCode: res.txn.txnCode,
        fromStatus: res.txn.status,
        toStatus: res.toStatus,
      }).catch(() => {});
    }
    void publishEvent("transaction.refunded", {
      txnId: res.txn.id,
      merchantId: res.txn.merchantId,
      txnCode: res.txn.txnCode,
      refundCode: base.refundCode,
      amount: Number(base.amount),
    }).catch(() => {});
    dispatchRefundSoon(refundId);
  }
  return "applied";
}

async function refundOutcome(refundId: number): Promise<RefundOutcomeView> {
  const prisma = getPrisma();
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { transaction: { include: TXN_INCLUDE } },
  });
  const txn = refund.transaction;
  const inflight = await inflightAmount(prisma, txn.id);
  return {
    refund: toRefundView(refund),
    transaction: {
      transaction_id: txn.txnCode,
      status: txn.status,
      amount: Number(txn.amount),
      refunded_amount: Number(txn.refundedAmount),
      refundable_amount: Math.max(0, Number(txn.amount) - Number(txn.refundedAmount) - inflight),
    },
  };
}

// ─── Processing refunds: poll / manual resolution ─────────────────────────────

async function loadProcessing(refundId: number, merchantId?: number) {
  const refund = await getPrisma().refund.findUnique({
    where: { id: refundId },
    include: { transaction: { include: TXN_INCLUDE } },
  });
  if (!refund || (merchantId !== undefined && refund.transaction.merchantId !== merchantId)) {
    throw new RefundError("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
  }
  return refund;
}

/**
 * Ask the PSP about a Processing refund (connectors with queryRefund — ZaloPay). Used by the worker
 * (syncPendingRefunds) and the admin "Kiểm tra" button.
 */
export async function checkRefundStatus(
  refundId: number,
  createdBy: string,
  merchantId?: number,
): Promise<RefundOutcomeView> {
  const refund = await loadProcessing(refundId, merchantId);
  if (refund.status !== "Processing") return refundOutcome(refundId);
  const pc = refund.transaction.partnerConfig;
  if (!pc || !refund.partnerRefundRef) {
    throw new RefundError(
      "REFUND_NOT_SUPPORTED",
      "Đối tác không có API tra cứu hoàn tiền — kiểm tra trên cổng đối tác rồi xác nhận thủ công",
    );
  }
  const { connector } = connectorFromPartnerConfig(pc);
  if (!connector.queryRefund) {
    throw new RefundError(
      "REFUND_NOT_SUPPORTED",
      `${pc.connectorType} không có API tra cứu hoàn tiền`,
    );
  }
  let result: RefundResult | undefined;
  let thrown: unknown;
  try {
    result = await connector.queryRefund(refund.partnerRefundRef);
  } catch (e) {
    thrown = e;
  }
  await getPrisma().refund.update({
    where: { id: refundId },
    data: { checkCount: { increment: 1 }, lastCheckedAt: new Date() },
  });
  await applyRefundOutcome(refundId, outcomeOf(result, thrown, pc.connectorType), { createdBy });
  return refundOutcome(refundId);
}

/**
 * Operator confirmation of a Processing refund after checking the partner portal — for answers the
 * Hub could not get (timeout, HTTP 5xx, PSP without a refund query API).
 */
export async function resolveRefund(
  refundId: number,
  input: { outcome: "Completed" | "Failed"; note: string; partnerRefundId?: string },
  actor: { username: string; merchantId?: number },
): Promise<RefundOutcomeView> {
  const refund = await loadProcessing(refundId, actor.merchantId);
  if (refund.status !== "Processing") {
    throw new RefundError(
      "TRANSACTION_NOT_REFUNDABLE",
      `Yêu cầu hoàn tiền đã kết thúc (${refund.status})`,
    );
  }
  const message = `Xác nhận thủ công bởi ${actor.username}: ${input.note}`;
  const applied = await applyRefundOutcome(
    refundId,
    input.outcome === "Completed"
      ? {
          kind: "completed",
          partnerRefundId: input.partnerRefundId || undefined,
          responseCode: "MANUAL",
          message,
        }
      : { kind: "failed", responseCode: "MANUAL", message },
    { createdBy: actor.username },
  );
  if (applied === "unchanged") {
    throw new RefundError("TRANSACTION_NOT_REFUNDABLE", "Yêu cầu hoàn tiền vừa được cập nhật");
  }
  return refundOutcome(refundId);
}

/** Processing refunds whose PSP can be asked again and whose back-off has elapsed. */
export async function dueRefundChecks(now = new Date(), batch = 20, maxAgeDays = 7) {
  const asyncTypes = asyncRefundConnectorTypes();
  if (asyncTypes.length === 0) return [];
  const rows = await getPrisma().refund.findMany({
    where: {
      status: "Processing",
      partnerRefundRef: { not: null },
      createdAt: { gte: new Date(now.getTime() - maxAgeDays * 86_400_000) },
      transaction: { partnerConfig: { connectorType: { in: asyncTypes } } },
    },
    select: { id: true, refundCode: true, checkCount: true, lastCheckedAt: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: batch * 5,
  });
  return rows
    .filter((r) => {
      const last = (r.lastCheckedAt ?? r.updatedAt).getTime();
      return now.getTime() - last >= refundCheckDelayMs(r.checkCount);
    })
    .slice(0, batch);
}
