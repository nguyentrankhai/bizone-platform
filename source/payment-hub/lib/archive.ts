/**
 * Transaction archiving rules (P7.4) — pure, shared by the archive service and tests.
 * The archive table `transactions_archive` is RANGE COLUMNS(created_at) partitioned by month:
 * `p_old` (everything before the first month), `pYYYYMM` per month, `p_max` (MAXVALUE).
 */

/** Statuses after which a transaction never changes again by itself (no IPN / expiry / sync). */
export const ARCHIVABLE_STATUSES = [
  "Success",
  "Failed",
  "Expired",
  "Refunded",
  "PartiallyRefunded",
] as const;

export interface ArchiveSettings {
  /** Transactions created more than this many months ago are archived; 0 = archiving off */
  months: number;
  /** Archive partitions older than this many months are dropped; 0 = keep forever */
  retentionMonths: number;
  batchSize: number;
  maxPerRun: number;
}

function intEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

/**
 * Defaults: archive after 24 months — reports compare up to one year back over ranges of up to
 * 366 days (P5.5), and refunds / disputes are long closed; keep archived months forever.
 */
export function archiveSettings(
  env: Record<string, string | undefined> = process.env,
): ArchiveSettings {
  const months = intEnv(env, "TXN_ARCHIVE_MONTHS", 24, 0, 600);
  if (months > 0 && months < 13) {
    throw new Error("TXN_ARCHIVE_MONTHS must be 0 (off) or ≥ 13 — reports read the last 12 months");
  }
  const retentionMonths = intEnv(env, "TXN_ARCHIVE_RETENTION_MONTHS", 0, 0, 1200);
  if (retentionMonths > 0 && retentionMonths <= months) {
    throw new Error(
      "TXN_ARCHIVE_RETENTION_MONTHS must be 0 (keep) or greater than TXN_ARCHIVE_MONTHS",
    );
  }
  return {
    months,
    retentionMonths,
    batchSize: intEnv(env, "TXN_ARCHIVE_BATCH", 500, 1, 5000),
    maxPerRun: intEnv(env, "TXN_ARCHIVE_MAX_PER_RUN", 200_000, 1, 10_000_000),
  };
}

/** First day (UTC) of the month `months` before `now`'s month — rows created before it qualify. */
export function monthsAgo(now: Date, months: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}

/** "2024-03" for a date (UTC month). */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function partitionName(month: string): string {
  return `p${month.replace("-", "")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m, 1)));
}

/** Upper bound literal of a month partition: first second of the next month. */
export function partitionBound(month: string): string {
  return `${nextMonth(month)}-01 00:00:00`;
}

export interface PartitionInfo {
  name: string;
  /** `'2025-02-01 00:00:00'` (quotes as stored by MariaDB) or `MAXVALUE` */
  description: string;
}

/** Highest finite upper bound among the partitions, as "YYYY-MM" of the month it starts. */
export function lastBoundMonth(parts: PartitionInfo[]): string | null {
  let best: string | null = null;
  for (const p of parts) {
    const m = /(\d{4})-(\d{2})-01/.exec(p.description);
    if (!m) continue;
    const month = `${m[1]}-${m[2]}`;
    if (!best || month > best) best = month;
  }
  return best;
}

/**
 * Month partitions to add so every month in `needed` has its own partition. Months before the
 * last finite bound are already covered (by their partition or by p_old); later months are
 * created in order, filling gaps, by splitting p_max.
 */
export function monthsToCreate(parts: PartitionInfo[], needed: string[]): string[] {
  const last = lastBoundMonth(parts);
  if (!last || needed.length === 0) return [];
  const target = needed.reduce((a, b) => (a > b ? a : b));
  const out: string[] = [];
  for (let m = last; m <= target; m = nextMonth(m)) out.push(m);
  return out;
}

/** REORGANIZE statement splitting p_max into the given months + a new p_max. */
export function reorganizeSql(table: string, months: string[]): string | null {
  if (months.length === 0) return null;
  const defs = months.map(
    (m) => `PARTITION \`${partitionName(m)}\` VALUES LESS THAN ('${partitionBound(m)}')`,
  );
  return (
    `ALTER TABLE \`${table}\` REORGANIZE PARTITION \`p_max\` INTO (` +
    `${defs.join(", ")}, PARTITION \`p_max\` VALUES LESS THAN (MAXVALUE))`
  );
}

/**
 * Month partitions entirely older than the retention cutoff (dropped). `p_old` is emptied
 * (TRUNCATE) instead, never dropped, so an old row can always be stored.
 */
export function expiredPartitions(
  parts: PartitionInfo[],
  now: Date,
  retentionMonths: number,
): string[] {
  if (retentionMonths <= 0) return [];
  const cutoff = monthKey(monthsAgo(now, retentionMonths));
  return parts
    .filter((p) => /^p\d{6}$/.test(p.name))
    .filter((p) => {
      const m = /(\d{4})-(\d{2})-01/.exec(p.description);
      // upper bound ≤ cutoff month start → every row is older than the cutoff
      return m ? `${m[1]}-${m[2]}` <= cutoff : false;
    })
    .map((p) => p.name);
}
