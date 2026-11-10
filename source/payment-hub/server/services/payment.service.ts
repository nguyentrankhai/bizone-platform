import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  connectorFromPartnerConfig,
  definitionForConnectorType,
  resolveConnectorByCode,
} from "@/services/connectors/registry";
import type { PartnerQr, PaymentResult } from "@/services/connectors/types";
import { routeFor } from "@/services/routing/routeMap";
import {
  NoRouteError,
  executeRoute,
  isBusinessError,
  planRoute,
  type RouteAttempt,
} from "@/services/routing/routeEngine";
import { OUTBOX_PENDING, dispatchSoon } from "@/server/services/webhook.service";
import { QrError, generateQr, type QrDto } from "@/server/services/qr.service";
import { renderQrPng, type QrSize } from "@/services/qr/vietqr";

/**
 * Bridges the Transaction Engine and PSP connectors:
 *  - initiatePayment: Route Engine picks the partner for the payment method (merchant
 *    priority + fallback), then either builds the PSP payment URL (redirect connectors) or
 *    renders the VietQR code (qr); the transaction moves Created → Pending
 *  - applyPaymentResult: apply a verified PSP result (IPN) atomically
 *  - syncPaymentStatus: ask the PSP (server-to-server query) for a Pending transaction whose
 *    IPN has not arrived and apply a final answer — the "retry" path when an IPN is lost
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

/** Wallet QR returned by the PSP (MoMo `qrCodeUrl`), rendered to PNG by Payment Hub. */
export interface PartnerQrDto {
  qr_id: number;
  type: "PartnerQR";
  provider: string;
  size: number;
  raw_data: string;
  image_base64: string;
  image_url: null;
  deeplink: string | null;
  transfer_note: null;
  bank: null;
  expires_at: string | null;
  created_at: string;
}

export type InitiatedPayment =
  | ({ kind: "redirect"; paymentUrl: string; qr?: PartnerQrDto } & RoutingInfo)
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

  // Nth payment URL of this transaction at this PSP — PSPs that need a unique order id per
  // request (MoMo) derive it from this.
  const attempt =
    (await prisma.transactionRawData.count({
      where: { transactionId: txn.id, endpoint: `${def.code}:pay`, direction: "Request" },
    })) + 1;

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
        attempt,
      });
    });
  } catch (e) {
    if (e instanceof NoRouteError) throw noRouteToPaymentError(e);
    // The PSP refused this transaction's input (e.g. MoMo amount limits) — not an outage.
    if (isBusinessError(e)) {
      throw new PaymentError((e as PaymentError).code, (e as Error).message);
    }
    throw e;
  }
  const { paymentUrl, partnerRequest, partnerResponse, partnerQr } = outcome.result;
  const partner = outcome.partner;
  const qrSize = opts.qrSize ?? 300;
  const qrPng = partnerQr ? await renderQrPng(partnerQr.content, qrSize) : null;

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
    ...(partnerResponse
      ? [
          prisma.transactionRawData.create({
            data: {
              transactionId: txn.id,
              direction: "Response",
              source: "Partner",
              endpoint: `${def.code}:pay`,
              body: partnerResponse as Prisma.InputJsonValue,
            },
          }),
        ]
      : []),
  ]);

  const qr =
    partnerQr && qrPng
      ? await savePartnerQr(txn.id, def.connectorType, partnerQr, qrPng, qrSize)
      : undefined;

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
    ...(qr ? { qr } : {}),
    partnerConfigId: partner.id,
    connectorType: def.connectorType,
    fallbackUsed: outcome.fallbackUsed,
    attempts: outcome.attempts,
  };
}

/**
 * Keep the wallet QR of the current payment URL in qr_codes (type PartnerQR): earlier ones of the
 * transaction are retired; the expiry job clears them once the transaction ends.
 */
async function savePartnerQr(
  transactionId: number,
  provider: string,
  qr: PartnerQr,
  png: Buffer,
  size: number,
): Promise<PartnerQrDto> {
  const prisma = getPrisma();
  const imageBase64 = png.toString("base64");
  const row = await prisma.$transaction(async (tx) => {
    await tx.qrCode.updateMany({
      where: { transactionId, qrType: "PartnerQR", isExpired: false },
      data: { isExpired: true, imageBase64: null },
    });
    return tx.qrCode.create({
      data: {
        transactionId,
        qrType: "PartnerQR",
        rawData: qr.content,
        imageBase64,
        size,
        expiresAt: qr.expiresAt ?? null,
      },
    });
  });
  return {
    qr_id: row.id,
    type: "PartnerQR",
    provider,
    size,
    raw_data: qr.content,
    image_base64: imageBase64,
    image_url: null,
    deeplink: qr.deeplink ?? null,
    transfer_note: null,
    bank: null,
    expires_at: qr.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
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
  | { kind: "pending" }
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
  // Non-final PSP status (MoMo 1000/7000/9000…): recorded above, nothing to apply.
  if (result.outcome === "Pending") return { kind: "pending" };

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

export type SyncOutcome =
  | { kind: "applied"; status: "Success" | "Failed" }
  | { kind: "pending" | "unknown"; responseCode: string }
  | { kind: "skipped"; reason: string }
  | { kind: "already_final"; status: string }
  | { kind: "amount_mismatch" };

/**
 * Ask the PSP for the status of a Pending transaction (server-to-server query) and apply a final
 * answer through applyPaymentResult — same idempotent conditional update as the IPN. Used by the
 * worker for transactions whose IPN is late or lost, and by the MoMo return page so the merchant's
 * return_url carries the real status. Only for connectors with `statusSync` (MoMo).
 */
export async function syncPaymentStatus(
  txn: { id: number; txnCode: string; status: string; partnerConfigId: number | null },
  createdBy: string,
): Promise<SyncOutcome> {
  if (txn.status !== "Pending") return { kind: "already_final", status: txn.status };
  if (!txn.partnerConfigId) return { kind: "skipped", reason: "no_partner" };
  const prisma = getPrisma();
  const pc = await prisma.partnerConfig.findUnique({ where: { id: txn.partnerConfigId } });
  const def = pc ? definitionForConnectorType(pc.connectorType) : undefined;
  if (!pc || !def?.statusSync) return { kind: "skipped", reason: "not_supported" };

  const sent = await getLatestPartnerRequest(txn.id, def.code);
  if (!sent) return { kind: "skipped", reason: "no_partner_request" };
  const { connector } = connectorFromPartnerConfig(pc);
  const status = await connector.getStatus({
    txnCode: txn.txnCode,
    partnerOrderId: sent.orderId,
    transactionDate: sent.vnp_CreateDate ?? "",
    ipAddress: "127.0.0.1",
  });
  if (!status.signatureValid || (status.outcome !== "Success" && status.outcome !== "Failed")) {
    return {
      kind: status.outcome === "Pending" ? "pending" : "unknown",
      responseCode: status.responseCode,
    };
  }
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries((status.partnerRaw ?? {}) as Record<string, unknown>)) {
    if (v !== undefined && v !== null && typeof v !== "object") raw[k] = String(v);
  }
  const result = connector.processResult(raw);
  if (result.txnCode !== txn.txnCode || result.outcome !== status.outcome) {
    return { kind: "unknown", responseCode: status.responseCode };
  }
  const applied = await applyPaymentResult(result, { endpoint: `${def.code}:query`, createdBy });
  if (applied.kind === "applied") return { kind: "applied", status: applied.status };
  if (applied.kind === "already_final") return applied;
  if (applied.kind === "amount_mismatch") return applied;
  if (applied.kind === "pending") return { kind: "pending", responseCode: status.responseCode };
  return { kind: "skipped", reason: "not_found" };
}
