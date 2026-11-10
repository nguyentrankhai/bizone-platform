import { getPrisma } from "@/lib/prisma";
import { statusSyncDefinitions } from "@/services/connectors/registry";
import { syncPaymentStatus } from "@/server/services/payment.service";

/**
 * Recover lost / failed IPNs: query the PSP for Pending transactions of connectors that support
 * it (MoMo) once their IPN is overdue, and apply a final answer (same conditional update as the
 * IPN, so a racing IPN is harmless). Runs every minute in the worker; each transaction is asked
 * at most once per run until it becomes final or expires.
 */

/** Give the IPN this long before asking the PSP (seconds since the payment URL was created). */
const SYNC_AFTER_S = Number(process.env.PAYMENT_STATUS_SYNC_AFTER_S ?? 60);
/** Max transactions queried per run (bounds PSP calls per minute). */
const SYNC_BATCH = Number(process.env.PAYMENT_STATUS_SYNC_BATCH ?? 20);

export async function runSyncPendingPayments(): Promise<void> {
  const types = statusSyncDefinitions().map((d) => d.connectorType);
  if (types.length === 0) return;
  const now = new Date();
  const txns = await getPrisma().transaction.findMany({
    where: {
      status: "Pending",
      partnerConfig: { connectorType: { in: types } },
      updatedAt: { lte: new Date(now.getTime() - SYNC_AFTER_S * 1000) },
      OR: [{ expiredAt: null }, { expiredAt: { gt: now } }],
    },
    select: { id: true, txnCode: true, status: true, partnerConfigId: true },
    orderBy: { updatedAt: "asc" },
    take: SYNC_BATCH,
  });

  let applied = 0;
  for (const txn of txns) {
    try {
      const res = await syncPaymentStatus(txn, "system:status-sync");
      if (res.kind === "applied") {
        applied++;
        console.log(`[status-sync] ${txn.txnCode} → ${res.status}`);
      } else if (res.kind === "amount_mismatch") {
        console.warn(`[status-sync] ${txn.txnCode}: PSP amount differs — needs reconciliation`);
      }
    } catch (e) {
      console.error(`[status-sync] ${txn.txnCode}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (txns.length > 0) {
    console.log(`[status-sync] checked ${txns.length} pending transaction(s), ${applied} updated`);
  }
}
