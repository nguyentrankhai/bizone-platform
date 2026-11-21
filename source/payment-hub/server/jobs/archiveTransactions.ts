import { runArchive, type ArchiveRunResult } from "@/server/services/archive.service";

/**
 * Nightly archive (P7.4, worker maintenance task "archive", `TXN_ARCHIVE_CRON` default 02:45 VN):
 * final transactions older than TXN_ARCHIVE_MONTHS → `transactions_archive` (monthly partitions),
 * then drops archive partitions older than TXN_ARCHIVE_RETENTION_MONTHS (0 = keep).
 */
export async function runArchiveTransactions(now = new Date()): Promise<ArchiveRunResult> {
  return runArchive(now);
}
