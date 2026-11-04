import { expireOverdueTransactions } from "@/server/services/transaction.service";

/**
 * Run once: expire all overdue transactions.
 * Called by the BullMQ worker on a repeating schedule (every minute).
 */
export async function runExpireJob(): Promise<void> {
  const count = await expireOverdueTransactions();
  if (count > 0) {
    console.log(`[expire-job] Expired ${count} transaction(s)`);
  }
}
