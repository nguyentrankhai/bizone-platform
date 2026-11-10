import { checkRefundStatus, dueRefundChecks } from "@/server/services/refund.service";

/**
 * Asynchronous refunds (P5.3): ask the PSP again about refunds still Processing (ZaloPay
 * query_refund) with back-off 1, 2, 4 … 60 min, for up to REFUND_STATUS_SYNC_MAX_DAYS days.
 * Refunds of PSPs without a refund query API wait for manual confirmation (admin UI).
 */

const BATCH = Number(process.env.REFUND_STATUS_SYNC_BATCH ?? 20);
const MAX_DAYS = Number(process.env.REFUND_STATUS_SYNC_MAX_DAYS ?? 7);

export async function runSyncPendingRefunds(): Promise<void> {
  const due = await dueRefundChecks(new Date(), BATCH, MAX_DAYS);
  let settled = 0;
  for (const r of due) {
    try {
      const res = await checkRefundStatus(r.id, "system:refund-sync");
      if (res.refund.status !== "Processing") {
        settled++;
        console.log(`[refund-sync] ${r.refundCode} → ${res.refund.status}`);
      }
    } catch (e) {
      console.error(`[refund-sync] ${r.refundCode}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (due.length > 0) {
    console.log(`[refund-sync] checked ${due.length} processing refund(s), ${settled} settled`);
  }
}
