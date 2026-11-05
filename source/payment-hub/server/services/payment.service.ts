import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  connectorFromPartnerConfig,
  definitionForConnectorType,
  resolveConnectorByCode,
} from "@/services/connectors/registry";
import type { PaymentResult } from "@/services/connectors/types";
import { routeFor } from "@/services/routing/routeMap";
import {
  NoRouteError,
  executeRoute,
  planRoute,
  type RouteAttempt,
} from "@/services/routing/routeEngine";
import { OUTBOX_PENDING, dispatchSoon } from "@/server/services/webhook.service";
import { QrError, generateQr, type QrDto } from "@/server/services/qr.service";
import type { QrSize } from "@/services/qr/vietqr";

/**
 * Bridges the Transaction Engine and PSP connectors:
 *  - initiatePayment: Route Engine picks the partner for the payment method (merchant
 *    priority + fallback), then either builds the PSP payment URL (redirect connectors) or
 *    renders the VietQR code (qr); the transaction moves Created → Pending
 *  - applyPaymentResult: apply a verified PSP result (IPN) atomically
 */

const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

export class PaymentError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export function defaultReturnUrl(connectorCode: string): string {
  return `${APP_URL}/pay/${connectorCode}/return`;
}

/** Hosted payment page of a transaction (method picker / QR screen). */
export function hostedPaymentUrl(txnCode: string): string {
  return `${APP_URL}/pay/${encodeURIComponent(txnCode)}`;
}

interface RoutingInfo {
  partnerConfigId: number;
  connectorType: string;
  fallbackUsed: boolean;
  attempts: RouteAttempt[];
}

export type InitiatedPayment =
  | ({ kind: "redirect"; paymentUrl: string } & RoutingInfo)
  | ({ kind: "qr"; paymentUrl: string; qr: QrDto } & RoutingInfo);

/** Turn a NoRouteError into the API-facing 503 (with why each partner was not used). */
export function noRouteToPaymentError(e: NoRouteError): PaymentError {
  if (e.reason === "unknown_method") {
    return new PaymentError("VALIDATION_ERROR", "Unsupported payment method");
  }
  return new PaymentError("SERVICE_UNAVAILABLE", "Payment method is not available", {
    payment_method: e.method,
    reason: e.reason,
    skipped: e.skipped.map((s) => ({ partner_config_id: s.partnerConfigId, reason: s.reason })),
    // Partner error messages stay in the server log — they can describe internal config.
    attempts: e.attempts.map((a) => ({ partner_config_id: a.partnerConfigId, ok: a.ok })),
  });
}

export async function initiatePayment(
  txnCode: string,
  paymentMethod: string,
  ipAddress: string | undefined,
  opts: { qrSize?: QrSize } = {},
): Promise<InitiatedPayment> {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({ where: { txnCode } });
  if (!txn) throw new PaymentError("NOT_FOUND", "Transaction not found");
  if (txn.status !== "Created" && txn.status !== "Pending") {
    throw new PaymentError("CONFLICT", `Transaction is ${txn.status}`);
  }
  if (txn.expiredAt && txn.expiredAt <= new Date()) {
    throw new PaymentError("CONFLICT", "Transaction has expired");
  }
  const route = routeFor(paymentMethod);
  if (!route) throw new PaymentError("VALIDATION_ERROR", "Unsupported payment method");

  // VietQR: rendered by Payment Hub; qr.service routes the receiving account itself.
  if (route.kind === "qr") {
    try {
      const res = await generateQr(txn.merchantId, txn.txnCode, {
        type: "VietQR",
        size: opts.qrSize ?? 300,
      });
      return {
        kind: "qr",
        paymentUrl: hostedPaymentUrl(txn.txnCode),
        qr: res.qr,
        partnerConfigId: res.routing?.partnerConfigId ?? txn.partnerConfigId ?? 0,
        connectorType: route.connectorType,
        fallbackUsed: res.routing?.fallbackUsed ?? false,
        attempts: res.routing?.attempts ?? [],
      };
    } catch (e) {
      if (e instanceof NoRouteError) throw noRouteToPaymentError(e);
      if (e instanceof QrError) throw new PaymentError(e.code, e.message, e.details);
      throw e;
    }
  }

  const def = definitionForConnectorType(route.connectorType);
  if (!def) {
    throw new PaymentError("SERVICE_UNAVAILABLE", "Payment method is not available", {
      payment_method: paymentMethod,
      reason: "no_partner",
    });
  }

  let outcome;
  try {
    const plan = await planRoute(txn.merchantId, paymentMethod);
    outcome = await executeRoute(plan, async (partner) => {
      const resolved = connectorFromPartnerConfig(partner);
      return resolved.connector.createTransaction({
        txnCode: txn.txnCode,
        amount: Number(txn.amount),
        currency: txn.currency,
        description: txn.description ?? `Thanh toan ${txn.txnCode}`,
        paymentMethod,
        returnUrl: resolved.callbackUrl ?? defaultReturnUrl(def.code),
        ipAddress: ipAddress ?? txn.ipAddress ?? "127.0.0.1",
        createdAt: new Date(),
        expiredAt: txn.expiredAt ?? undefined,
      });
    });
  } catch (e) {
    if (e instanceof NoRouteError) throw noRouteToPaymentError(e);
    throw e;
  }
  const { paymentUrl, partnerRequest } = outcome.result;
  const partner = outcome.partner;

  const fromStatus = txn.status;
  const fallbackNote = outcome.fallbackUsed
    ? ` — fallback after ${outcome.attempts
        .filter((a) => !a.ok)
        .map((a) => `#${a.partnerConfigId}`)
        .join(", ")} failed`
    : "";
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: txn.id },
      data: {
        status: "Pending",
        paymentMethod,
        partnerConfigId: partner.id,
      },
    }),
    prisma.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: fromStatus === "Created" ? "status_changed:pending" : "payment_url_regenerated",
        fromStatus,
        toStatus: "Pending",
        description: `Payment URL created via ${def.connectorType} "${partner.name}" (#${partner.id}, ${paymentMethod})${fallbackNote}`,
        createdBy: "system:payment",
      },
    }),
    prisma.transactionRawData.create({
      data: {
        transactionId: txn.id,
        direction: "Request",
        source: "PaymentHub",
        endpoint: `${def.code}:pay`,
        body: partnerRequest as Prisma.InputJsonValue,
      },
    }),
  ]);

  if (fromStatus === "Created") {
    void publishEvent("transaction.status_changed", {
      txnId: txn.id,
      merchantId: txn.merchantId,
      txnCode: txn.txnCode,
      fromStatus,
      toStatus: "Pending",
    }).catch(() => {});
  }

  return {
    kind: "redirect",
    paymentUrl,
    partnerConfigId: partner.id,
    connectorType: def.connectorType,
    fallbackUsed: outcome.fallbackUsed,
    attempts: outcome.attempts,
  };
}

/** Find the request params the connector sent for a transaction (e.g. vnp_CreateDate). */
export async function getLatestPartnerRequest(
  transactionId: number,
  connectorCode: string,
): Promise<Record<string, string> | null> {
  const row = await getPrisma().transactionRawData.findFirst({
    where: { transactionId, endpoint: `${connectorCode}:pay`, direction: "Request" },
    orderBy: { id: "desc" },
  });
  return (row?.body as Record<string, string> | null) ?? null;
}

export type ApplyResult =
  | { kind: "applied"; status: "Success" | "Failed" }
  | { kind: "not_found" }
  | { kind: "amount_mismatch" }
  | { kind: "already_final"; status: string };

/**
 * Apply a signature-verified PSP result. Idempotent and race-safe: the status
 * update only happens while the transaction is still Pending (conditional UPDATE),
 * so concurrent IPN retries produce exactly one state change + log.
 */
export async function applyPaymentResult(
  result: PaymentResult,
  source: { endpoint: string; createdBy: string },
): Promise<ApplyResult> {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({ where: { txnCode: result.txnCode } });
  if (!txn) return { kind: "not_found" };

  await prisma.transactionRawData.create({
    data: {
      transactionId: txn.id,
      direction: "Request",
      source: "Partner",
      endpoint: source.endpoint,
      body: result.partnerRaw as Prisma.InputJsonValue,
    },
  });

  if (Number(txn.amount) !== result.amount) return { kind: "amount_mismatch" };

  if (txn.status !== "Pending") {
    if (result.outcome === "Success" && (txn.status === "Expired" || txn.status === "Failed")) {
      // Paid at the PSP after we gave up — flag for reconciliation / manual refund.
      await prisma.transactionLog.create({
        data: {
          transactionId: txn.id,
          event: "late_payment",
          fromStatus: txn.status,
          toStatus: txn.status,
          description: `PSP reported success for a ${txn.status} transaction (partner txn ${result.partnerTxnId ?? "?"}) — needs reconciliation`,
          rawData: result.partnerRaw as Prisma.InputJsonValue,
          createdBy: source.createdBy,
        },
      });
    }
    return { kind: "already_final", status: txn.status };
  }

  const toStatus = result.outcome === "Success" ? "Success" : "Failed";
  const applied = await prisma.$transaction(async (tx) => {
    const { count } = await tx.transaction.updateMany({
      where: { id: txn.id, status: "Pending" },
      data: {
        status: toStatus,
        partnerTxnId: result.partnerTxnId ?? null,
        ...(toStatus === "Success" ? { paidAt: result.paidAt ?? new Date() } : {}),
        ...OUTBOX_PENDING, // payment.success / payment.failed webhook (P3.6)
      },
    });
    if (count === 0) return false;
    await tx.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: `status_changed:${toStatus.toLowerCase()}`,
        fromStatus: "Pending",
        toStatus,
        description:
          toStatus === "Success"
            ? `Payment confirmed by PSP (partner txn ${result.partnerTxnId ?? "?"})`
            : `Payment failed: ${result.errorMessage ?? result.errorCode ?? "unknown"}`,
        rawData: result.partnerRaw as Prisma.InputJsonValue,
        createdBy: source.createdBy,
      },
    });
    return true;
  });

  if (!applied) {
    const fresh = await prisma.transaction.findUnique({
      where: { id: txn.id },
      select: { status: true },
    });
    return { kind: "already_final", status: fresh?.status ?? "Unknown" };
  }

  void publishEvent("transaction.status_changed", {
    txnId: txn.id,
    merchantId: txn.merchantId,
    txnCode: txn.txnCode,
    fromStatus: "Pending",
    toStatus,
  }).catch(() => {});
  dispatchSoon(txn.id);

  return { kind: "applied", status: toStatus };
}

export { resolveConnectorByCode };
