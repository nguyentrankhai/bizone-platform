import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import type { Prisma, PosPaymentIntent } from "@/generated/prisma/client";
import type { CreatePayhubIntentInput, PayhubMethod } from "@/lib/validators/pos";
import type { PayhubIntentView } from "@/lib/pos/protocol";
import { assertActorBranch, type PosActor } from "./cashSession.service";
import { publishPosEvent } from "./posEvents";
import { recordAudit } from "./auditLog.service";
import type { SalePayment } from "./payment.service";
import {
  createPayhubTransaction,
  getPayhubTransaction,
  PaymentHubError,
  payhubConfig,
} from "./payment/paymentHubClient";

/**
 * Card / QR payments through Payment Hub at the POS (P4.5).
 *
 * 1. The cashier asks for a QR (or card payment page) → an intent row is created and Payment Hub
 *    opens a transaction with `merchant_txn_id = BZ-{tenant}-{intentId}`.
 * 2. Payment Hub reports the outcome by webhook (`/api/webhooks/payhub`); while the modal is open
 *    the POS also polls `pos.payhubStatus`, which asks Payment Hub directly (no public URL in dev).
 * 3. A successful intent is spent exactly once as an invoice / deposit payment (`consumeIntents`).
 */

/** Payment Hub route method used for each POS method — overridable per deployment */
export function payhubRouteMethod(method: PayhubMethod): string {
  return method === "qr"
    ? (process.env.PAYHUB_QR_METHOD ?? "vietqr")
    : (process.env.PAYHUB_CARD_METHOD ?? "vnpay_card");
}

export const isPayhubEnabled = () => payhubConfig() !== null;

const MERCHANT_TXN = /^BZ-([A-Za-z0-9_-]+)-(\d+)$/;
export const merchantTxnIdOf = (tenantId: string, intentId: number) => `BZ-${tenantId}-${intentId}`;
export function parseMerchantTxnId(id: string | null | undefined) {
  const m = id ? MERCHANT_TXN.exec(id) : null;
  return m ? { tenantId: m[1], intentId: Number(m[2]) } : null;
}

/** Don't ask Payment Hub more often than this per intent (the modal polls every 2–3 s) */
const RECHECK_MS = 2_500;

export function intentView(i: PosPaymentIntent): PayhubIntentView {
  return {
    id: i.id,
    method: i.method,
    amount: Number(i.amount),
    status: i.status,
    txnCode: i.payhubTxnCode,
    qrData: i.qrData,
    paymentUrl: i.paymentUrl,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    paidAt: i.paidAt?.toISOString() ?? null,
    failureReason: i.failureReason,
    used: i.invoiceId !== null || i.preorderId !== null,
  };
}

async function publishIntent(i: PosPaymentIntent) {
  await publishPosEvent(i.cashSessionId, { type: "payhub:updated", data: intentView(i) });
}

async function loadIntent(id: number) {
  const i = await getPrisma().posPaymentIntent.findUnique({ where: { id } });
  if (!i) throw bizoneError("NOT_FOUND", `Thanh toán Payment Hub #${id} không tồn tại`);
  return i;
}

async function assertSessionAccess(cashSessionId: number, actor: PosActor) {
  const s = await getPrisma().cashSession.findUnique({ where: { id: cashSessionId } });
  if (!s) throw bizoneError("NOT_FOUND", `Ca #${cashSessionId} không tồn tại`);
  if (s.status !== "open") throw bizoneError("CONFLICT", "Ca đã khóa");
  if (s.userId !== actor.userId && !actor.canManage)
    throw bizoneError("FORBIDDEN", "Không thể thao tác trên ca của nhân viên khác");
  return s;
}

/** Tạo yêu cầu thanh toán QR / thẻ qua Payment Hub cho ca đang mở */
export async function createIntent(input: CreatePayhubIntentInput, actor: PosActor) {
  const cfg = payhubConfig();
  if (!cfg)
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      "Chưa cấu hình Payment Hub (PAYHUB_API_URL / PAYHUB_API_KEY / PAYHUB_API_SECRET)",
    );
  await assertSessionAccess(input.cashSessionId, actor);
  const prisma = getPrisma();
  const tenantId = currentTenantId();

  const created = await prisma.posPaymentIntent.create({
    data: {
      cashSessionId: input.cashSessionId,
      userId: actor.userId,
      method: input.method,
      amount: input.amount,
      // Real id is only known after insert — placeholder is unique and replaced right away
      merchantTxnId: `BZ-${tenantId}-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  const merchantTxnId = merchantTxnIdOf(tenantId, created.id);
  await prisma.posPaymentIntent.update({ where: { id: created.id }, data: { merchantTxnId } });

  const fail = async (reason: string) => {
    const failed = await prisma.posPaymentIntent.update({
      where: { id: created.id },
      data: { status: "failed", failureReason: reason.slice(0, 500) },
    });
    await publishIntent(failed);
  };

  let res;
  try {
    res = await createPayhubTransaction(cfg, {
      merchantTxnId,
      amount: input.amount,
      description: `BizOne POS ca ${input.cashSessionId}`,
      paymentMethod: payhubRouteMethod(input.method),
      expiryMinutes: 15,
      qrSize: 300,
      metadata: { source: "bizone-pos", tenant: tenantId, cashSessionId: input.cashSessionId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fail(msg);
    const unavailable =
      e instanceof PaymentHubError && (e.status === 0 || e.code === "SERVICE_UNAVAILABLE");
    throw bizoneError(
      unavailable ? "SERVICE_UNAVAILABLE" : "VALIDATION_ERROR",
      unavailable
        ? `${input.method === "card" ? "Cổng thanh toán thẻ" : "QR Payment Hub"} hiện không khả dụng — chọn phương thức khác (${msg})`
        : `Payment Hub từ chối: ${msg}`,
    );
  }
  if (res.payment_error || (!res.qr_code && !res.payment_url)) {
    const msg = res.payment_error?.message ?? "Payment Hub không trả QR / trang thanh toán";
    await fail(msg);
    throw bizoneError("SERVICE_UNAVAILABLE", `Không tạo được thanh toán: ${msg}`);
  }

  const intent = await prisma.posPaymentIntent.update({
    where: { id: created.id },
    data: {
      payhubTxnCode: res.txn_code,
      payhubMethod: res.payment_method,
      qrData: res.qr_code?.raw_data ?? null,
      paymentUrl: res.payment_url,
      expiresAt: res.qr_code?.expires_at
        ? new Date(res.qr_code.expires_at)
        : res.expired_at
          ? new Date(res.expired_at)
          : null,
    },
  });
  await publishIntent(intent);
  return {
    ...intentView(intent),
    bank: res.qr_code?.bank
      ? {
          name: res.qr_code.bank.name ?? "",
          accountNo: res.qr_code.bank.account_no ?? "",
          accountName: res.qr_code.bank.account_name ?? "",
        }
      : null,
  };
}

interface PayhubOutcome {
  status: string;
  amount: number;
  txnCode?: string | null;
  partnerTxnId?: string | null;
  paidAt?: string | null;
  failureReason?: string | null;
}

/**
 * Apply Payment Hub's view of a transaction to the intent (webhook and poll share this).
 * Conditional updates make it idempotent: replays and races change nothing twice.
 */
export async function applyOutcome(intent: PosPaymentIntent, o: PayhubOutcome) {
  const prisma = getPrisma();
  const now = new Date();
  let data: Prisma.PosPaymentIntentUpdateManyMutationInput | null = null;
  let where: Prisma.PosPaymentIntentWhereInput = { id: intent.id };

  if (o.status === "Success") {
    if (Math.round(o.amount) !== Math.round(Number(intent.amount))) {
      console.error(
        `[payhub] intent #${intent.id}: Payment Hub amount ${o.amount} ≠ ${Number(intent.amount)}`,
      );
      data = { failureReason: `Số tiền Payment Hub (${o.amount}) không khớp`, lastCheckedAt: now };
    } else {
      // Paid after the cashier gave up (cancelled/expired locally) still counts: money arrived
      where = { id: intent.id, status: { not: "success" } };
      data = {
        status: "success",
        paidAt: o.paidAt ? new Date(o.paidAt) : now,
        partnerTxnId: o.partnerTxnId ?? null,
        failureReason: null,
        lastCheckedAt: now,
      };
    }
  } else if (o.status === "Failed" || o.status === "Expired") {
    where = { id: intent.id, status: "pending" };
    data = {
      status: o.status === "Failed" ? "failed" : "expired",
      failureReason: o.failureReason?.slice(0, 500) ?? null,
      lastCheckedAt: now,
    };
  }

  if (!data) {
    await prisma.posPaymentIntent.update({
      where: { id: intent.id },
      data: { lastCheckedAt: now },
    });
    return intent;
  }
  const changed = await prisma.posPaymentIntent.updateMany({ where, data });
  const fresh = await loadIntent(intent.id);
  if (changed.count > 0 && "status" in data) {
    await publishIntent(fresh);
    if (fresh.status === "success") {
      await recordAudit({
        userId: intent.userId,
        module: "pos",
        action: "payhub_paid",
        entityType: "pos_payment_intent",
        entityId: intent.id,
        newValue: {
          txnCode: fresh.payhubTxnCode,
          amount: Number(fresh.amount),
          method: fresh.method,
        },
      });
    }
  }
  return fresh;
}

/** Trạng thái hiện tại; còn chờ → hỏi Payment Hub (dự phòng khi webhook chưa tới) */
/** QA-3 (#95): managers act on intents of their branches only */
async function assertIntentBranch(cashSessionId: number, actor: PosActor) {
  const s = await getPrisma().cashSession.findUnique({
    where: { id: cashSessionId },
    select: { branchId: true },
  });
  if (s) assertActorBranch(actor, s.branchId, "Thanh toán");
}

export async function intentStatus(id: number, actor: PosActor) {
  let intent = await loadIntent(id);
  if (intent.userId !== actor.userId && !actor.canManage)
    throw bizoneError("FORBIDDEN", "Không xem được thanh toán của nhân viên khác");
  await assertIntentBranch(intent.cashSessionId, actor);
  const cfg = payhubConfig();
  const stale = !intent.lastCheckedAt || Date.now() - intent.lastCheckedAt.getTime() > RECHECK_MS;
  if (cfg && intent.payhubTxnCode && stale && intent.status !== "success" && !intent.invoiceId) {
    try {
      const t = await getPayhubTransaction(cfg, intent.merchantTxnId);
      intent = await applyOutcome(intent, {
        status: t.status,
        amount: Number(t.amount),
        partnerTxnId: t.partnerTxnId,
        paidAt: t.paidAt,
      });
    } catch (e) {
      // Payment Hub unreachable: keep the local state, the webhook may still arrive
      console.warn(`[payhub] status check #${id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return intentView(intent);
}

/** Thu ngân huỷ chờ (khách đổi ý) — GD bên Payment Hub tự hết hạn */
export async function cancelIntent(id: number, actor: PosActor) {
  const intent = await loadIntent(id);
  if (intent.userId !== actor.userId && !actor.canManage)
    throw bizoneError("FORBIDDEN", "Không huỷ được thanh toán của nhân viên khác");
  await assertIntentBranch(intent.cashSessionId, actor);
  await getPrisma().posPaymentIntent.updateMany({
    where: { id, status: "pending" },
    data: { status: "cancelled" },
  });
  const fresh = await loadIntent(id);
  await publishIntent(fresh);
  return intentView(fresh);
}

/** Webhook from Payment Hub (already authenticated, inside the tenant scope) */
export async function applyWebhook(payload: {
  event?: string;
  transaction_id?: string;
  merchant_txn_id?: string | null;
  amount?: number;
  status?: string;
  partner_txn_id?: string | null;
  paid_at?: string | null;
  failure_reason?: string | null;
}) {
  const ref = parseMerchantTxnId(payload.merchant_txn_id);
  if (!ref) return { applied: false, reason: "not a POS transaction" };
  const intent = await getPrisma().posPaymentIntent.findUnique({ where: { id: ref.intentId } });
  if (!intent || intent.merchantTxnId !== payload.merchant_txn_id)
    return { applied: false, reason: "unknown intent" };
  if (
    intent.payhubTxnCode &&
    payload.transaction_id &&
    payload.transaction_id !== intent.payhubTxnCode
  )
    return { applied: false, reason: "transaction mismatch" };

  const status =
    payload.event === "payment.success"
      ? "Success"
      : payload.event === "payment.failed"
        ? "Failed"
        : payload.event === "payment.expired"
          ? "Expired"
          : (payload.status ?? "");
  const fresh = await applyOutcome(intent, {
    status,
    amount: Number(payload.amount ?? 0),
    partnerTxnId: payload.partner_txn_id,
    paidAt: payload.paid_at,
    failureReason: payload.failure_reason,
  });
  return { applied: true, status: fresh.status };
}

// ─── Spending a paid intent ───────────────────────────────────────────────────

/**
 * Check card/QR lines that carry an intent before the sale (clear messages), and fill their
 * reference with the Payment Hub transaction code.
 */
export async function validateIntentPayments(
  payments: SalePayment[],
  cashSessionId: number,
): Promise<SalePayment[]> {
  const withIntent = payments.filter((p) => p.intentId);
  if (withIntent.length === 0) return payments;
  const ids = withIntent.map((p) => p.intentId!);
  if (new Set(ids).size !== ids.length)
    throw bizoneError("VALIDATION_ERROR", "Một thanh toán Payment Hub được dùng hai lần");
  const intents = await getPrisma().posPaymentIntent.findMany({ where: { id: { in: ids } } });
  return payments.map((p) => {
    if (!p.intentId) return p;
    const i = intents.find((x) => x.id === p.intentId);
    if (!i) throw bizoneError("NOT_FOUND", `Thanh toán Payment Hub #${p.intentId} không tồn tại`);
    if (i.cashSessionId !== cashSessionId)
      throw bizoneError("VALIDATION_ERROR", "Thanh toán Payment Hub thuộc ca khác");
    if (i.method !== p.method)
      throw bizoneError("VALIDATION_ERROR", "Phương thức không khớp thanh toán Payment Hub");
    if (i.status !== "success")
      throw bizoneError(
        "CONFLICT",
        `Payment Hub chưa xác nhận thanh toán ${i.payhubTxnCode ?? ""}`,
      );
    if (i.invoiceId || i.preorderId)
      throw bizoneError("CONFLICT", `Thanh toán ${i.payhubTxnCode} đã được dùng`);
    if (Math.round(Number(i.amount)) !== Math.round(p.amount))
      throw bizoneError(
        "VALIDATION_ERROR",
        `Số tiền ${p.amount.toLocaleString("vi-VN")}₫ khác số đã thanh toán qua Payment Hub (${Number(i.amount).toLocaleString("vi-VN")}₫)`,
      );
    return { ...p, referenceCode: i.payhubTxnCode };
  });
}

/** Inside the sale transaction: attach each paid intent to the invoice / pre-order, once */
export async function consumeIntents(
  tx: Prisma.TransactionClient,
  payments: SalePayment[],
  target: { invoiceId: number } | { preorderId: number },
) {
  for (const p of payments) {
    if (!p.intentId) continue;
    const res = await tx.posPaymentIntent.updateMany({
      where: { id: p.intentId, status: "success", invoiceId: null, preorderId: null },
      data: target,
    });
    if (res.count === 0)
      throw bizoneError("CONFLICT", "Thanh toán Payment Hub vừa được dùng cho giao dịch khác");
  }
}

/** Paid intents of a session not attached to any sale — money to reconcile at closing */
export async function unusedPaidIntents(cashSessionId: number) {
  const rows = await getPrisma().posPaymentIntent.findMany({
    where: { cashSessionId, status: "success", invoiceId: null, preorderId: null },
    orderBy: { id: "asc" },
  });
  return rows.map(intentView);
}

/** Intents of the session still worth showing to the cashier (pending or paid, unused) */
export async function openIntents(cashSessionId: number) {
  const rows = await getPrisma().posPaymentIntent.findMany({
    where: {
      cashSessionId,
      invoiceId: null,
      preorderId: null,
      status: { in: ["pending", "success"] },
    },
    orderBy: { id: "desc" },
    take: 20,
  });
  return rows.map(intentView);
}
