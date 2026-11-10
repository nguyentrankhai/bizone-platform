import type { Job } from "bullmq";
import {
  createRun,
  dailyCandidates,
  executeRun,
  vnYesterday,
} from "@/server/services/reconciliation.service";
import { getReconQueue, type ReconJob } from "@/services/reconciliation/queue";

/**
 * Daily reconciliation (P5.4, SRS-PH-RECON-01-01): at 00:00 Vietnam time reconcile yesterday for
 * every partner config with activity that day and a status-query API (VNPay, MoMo, ZaloPay).
 * VietQR has no such API: it is reconciled by importing the bank statement (admin UI).
 */

export const RECON_DAILY_CRON = process.env.RECON_DAILY_CRON || "0 0 * * *";

export async function runDailyReconciliation(day = vnYesterday()): Promise<number> {
  const ids = await dailyCandidates(day);
  for (const partnerConfigId of ids) {
    try {
      const run = await createRun({
        partnerConfigId,
        runDate: day,
        source: "Api",
        triggeredBy: "system:recon-daily",
      });
      const done = await executeRun(run.id);
      console.log(
        `[recon] ${day} partner config #${partnerConfigId}: ${done.status} — matched ${done.matched_count}, PH-only ${done.unmatched_paymenthub}, partner-only ${done.unmatched_partner}, amount ${done.amount_mismatch_count}, unverified ${done.unverified_count}`,
      );
    } catch (e) {
      console.error(
        `[recon] ${day} partner config #${partnerConfigId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return ids.length;
}

export async function processReconciliationJob(job: Job<ReconJob>): Promise<unknown> {
  if (job.data.kind === "run") {
    const run = await executeRun(job.data.runId);
    return { status: run.status };
  }
  return { partners: await runDailyReconciliation(job.data.day) };
}

export async function scheduleDailyReconciliation(): Promise<void> {
  await getReconQueue().upsertJobScheduler(
    "recon-daily",
    { pattern: RECON_DAILY_CRON, tz: "Asia/Ho_Chi_Minh" },
    { name: "daily", data: { kind: "daily" }, opts: { attempts: 1 } },
  );
}
