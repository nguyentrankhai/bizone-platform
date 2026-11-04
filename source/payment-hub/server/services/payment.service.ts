import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  ConnectorUnavailableError,
  definitionForMethod,
  resolveConnectorByCode,
  resolveConnectorForMethod,
} from "@/services/connectors/registry";
import type { PaymentResult } from "@/services/connectors/types";

/**
 * Bridges the Transaction Engine and PSP connectors:
 *  - initiatePayment: build the PSP payment URL, move Created → Pending
 *  - applyPaymentResult: apply a verified PSP result (IPN) atomically
 */

const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

export class PaymentError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export function defaultReturnUrl(connectorCode: string): string {
  return `${APP_URL}/pay/${connectorCode}/return`;
}

export async function initiatePayment(
  txnCode: string,
  paymentMethod: string,
  ipAddress: string | undefined,
): Promise<{ paymentUrl: string; partnerConfigId: number }> {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({ where: { txnCode } });
  if (!txn) throw new PaymentError("NOT_FOUND", "Transaction not found");
  if (txn.status !== "Created" && txn.status !== "Pending") {
    throw new PaymentError("CONFLICT", `Transaction is ${txn.status}`);
  }
  if (txn.expiredAt && txn.expiredAt <= new Date()) {
    throw new PaymentError("CONFLICT", "Transaction has expired");
  }
  const def = definitionForMethod(paymentMethod);
  if (!def) throw new PaymentError("VALIDATION_ERROR", `Unsupported payment method`);

  let resolved;
  try {
    resolved = await resolveConnectorForMethod(paymentMethod);
  } catch (e) {
    if (e instanceof ConnectorUnavailableError) {
      throw new PaymentError("SERVICE_UNAVAILABLE", e.message);
    }
    throw e;
  }

  const { paymentUrl, partnerRequest } = await resolved.connector.createTransaction({
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

  const fromStatus = txn.status;
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: txn.id },
      data: {
        status: "Pending",
        paymentMethod,
        partnerConfigId: resolved.partnerConfigId,
      },
    }),
    prisma.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: fromStatus === "Created" ? "status_changed:pending" : "payment_url_regenerated",
        fromStatus,
        toStatus: "Pending",
        description: `Payment URL created via ${def.connectorType} (${paymentMethod})`,
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
      txnCode: txn.txnCode,
      fromStatus,
      toStatus: "Pending",
    }).catch(() => {});
  }

  return { paymentUrl, partnerConfigId: resolved.partnerConfigId };
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
    txnCode: txn.txnCode,
    fromStatus: "Pending",
    toStatus,
  }).catch(() => {});

  return { kind: "applied", status: toStatus };
}

export { resolveConnectorByCode };
