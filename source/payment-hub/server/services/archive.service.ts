import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  ARCHIVABLE_STATUSES,
  archiveSettings,
  expiredPartitions,
  monthKey,
  monthsAgo,
  monthsToCreate,
  reorganizeSql,
  type PartitionInfo,
} from "@/lib/archive";

/**
 * Transaction archiving (P7.4). `transactions` stays unpartitioned (unique txn_code /
 * merchant_txn_id + 7 FKs — see migration 12); the archive table is partitioned by month.
 *
 * A transaction is archived when it was created before the cutoff (TXN_ARCHIVE_MONTHS), is in a
 * final status, and nothing is still in flight: webhook outbox sent, no refund Pending /
 * Processing or waiting for its webhook, no dispute open or waiting for its webhook. One batch =
 * one DB transaction: rows locked, copied with their children folded into `history`, deleted
 * (children by FK cascade — the append-only triggers of P7.2 do not fire on cascades; these rows
 * are older than the 90-day guard anyway). Reads by id / txn_code / merchant_txn_id fall back to
 * the archive (`findArchivedTransaction`).
 */

const TABLE = "transactions_archive";

function eligibleWhere(cutoff: Date): Prisma.TransactionWhereInput {
  return {
    createdAt: { lt: cutoff },
    status: { in: [...ARCHIVABLE_STATUSES] },
    NOT: { notifyWebhook: true, webhookSentAt: null },
    refunds: {
      none: {
        OR: [
          { status: { in: ["Pending", "Processing"] } },
          { notifyWebhook: true, webhookSentAt: null },
        ],
      },
    },
    disputes: {
      none: {
        OR: [
          { status: { in: ["Pending", "Processing"] } },
          { notifyWebhook: true, webhookSentAt: null },
        ],
      },
    },
  };
}

const HISTORY_INCLUDE = {
  logs: { orderBy: { id: "asc" } },
  rawData: { orderBy: { id: "asc" } },
  refunds: { orderBy: { id: "asc" } },
  qrCodes: { orderBy: { id: "asc" }, omit: { imageBase64: true } },
  webhookLogs: { orderBy: { id: "asc" } },
  disputes: {
    orderBy: { id: "asc" },
    include: { attachments: true, logs: { orderBy: { id: "asc" } } },
  },
} satisfies Prisma.TransactionInclude;

type TxnWithHistory = Prisma.TransactionGetPayload<{ include: typeof HISTORY_INCLUDE }>;

/** JSON-safe copy (BigInt ids → string, Decimal → string, Date → ISO). */
function plain(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

function toArchiveRow(t: TxnWithHistory): Prisma.TransactionArchiveCreateManyInput {
  const { logs, rawData, refunds, qrCodes, webhookLogs, disputes, ...txn } = t;
  return {
    id: txn.id,
    txnCode: txn.txnCode,
    merchantId: txn.merchantId,
    merchantTxnId: txn.merchantTxnId,
    apiKeyId: txn.apiKeyId,
    amount: txn.amount,
    refundedAmount: txn.refundedAmount,
    currency: txn.currency,
    description: txn.description,
    status: txn.status,
    paymentMethod: txn.paymentMethod,
    partnerConfigId: txn.partnerConfigId,
    partnerTxnId: txn.partnerTxnId,
    returnUrl: txn.returnUrl,
    webhookUrl: txn.webhookUrl,
    customerName: txn.customerName,
    customerEmail: txn.customerEmail,
    customerPhone: txn.customerPhone,
    ipAddress: txn.ipAddress,
    metadata: txn.metadata === null ? Prisma.DbNull : (txn.metadata as Prisma.InputJsonValue),
    idempotencyKey: txn.idempotencyKey,
    expiredAt: txn.expiredAt,
    paidAt: txn.paidAt,
    createdAt: txn.createdAt,
    updatedAt: txn.updatedAt,
    history: plain({ logs, rawData, refunds, qrCodes, webhookLogs, disputes }),
  };
}

export async function listPartitions(): Promise<PartitionInfo[]> {
  const rows = await getPrisma().$queryRaw<{ name: string; description: string | null }[]>`
    SELECT PARTITION_NAME AS name, PARTITION_DESCRIPTION AS description
    FROM information_schema.PARTITIONS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${TABLE} AND PARTITION_NAME IS NOT NULL
    ORDER BY PARTITION_ORDINAL_POSITION`;
  return rows.map((r) => ({ name: r.name, description: r.description ?? "" }));
}

/** Creates the month partitions the given rows need (DDL — outside any transaction). */
export async function ensurePartitions(createdAts: Date[]): Promise<string[]> {
  const months = [...new Set(createdAts.map(monthKey))];
  const toCreate = monthsToCreate(await listPartitions(), months);
  const sql = reorganizeSql(TABLE, toCreate);
  if (sql) await getPrisma().$executeRawUnsafe(sql);
  return toCreate;
}

/** Moves one batch; returns how many transactions were archived. */
export async function archiveBatch(cutoff: Date, batchSize: number): Promise<number> {
  const prisma = getPrisma();
  const candidates = await prisma.transaction.findMany({
    where: eligibleWhere(cutoff),
    orderBy: { id: "asc" },
    take: batchSize,
    select: { id: true, createdAt: true },
  });
  if (candidates.length === 0) return 0;
  await ensurePartitions(candidates.map((c) => c.createdAt));

  const ids = candidates.map((c) => c.id);
  return prisma.$transaction(
    async (tx) => {
      // Lock the rows, then re-check eligibility under the lock (a refund / dispute may have
      // started since the candidate query)
      await tx.$queryRaw`SELECT id FROM transactions WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const rows = await tx.transaction.findMany({
        where: { id: { in: ids }, ...eligibleWhere(cutoff) },
        include: HISTORY_INCLUDE,
      });
      if (rows.length === 0) return 0;
      await tx.transactionArchive.createMany({ data: rows.map(toArchiveRow) });
      const { count } = await tx.transaction.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      return count;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export interface ArchiveRunResult {
  archived: number;
  cutoff: Date;
  createdPartitions: number;
  droppedPartitions: string[];
}

export async function runArchive(now = new Date()): Promise<ArchiveRunResult> {
  const settings = archiveSettings();
  const cutoff = monthsAgo(now, settings.months);
  const before = (await listPartitions()).length;
  let archived = 0;
  if (settings.months > 0) {
    while (archived < settings.maxPerRun) {
      const n = await archiveBatch(
        cutoff,
        Math.min(settings.batchSize, settings.maxPerRun - archived),
      );
      archived += n;
      if (n === 0) break;
    }
  }
  const droppedPartitions = await dropExpiredPartitions(now, settings.retentionMonths);
  const after = (await listPartitions()).length;
  return {
    archived,
    cutoff,
    createdPartitions: after - before + droppedPartitions.length,
    droppedPartitions,
  };
}

/** Retention of the archive itself (TXN_ARCHIVE_RETENTION_MONTHS, default 0 = keep). */
export async function dropExpiredPartitions(now: Date, retentionMonths: number): Promise<string[]> {
  if (retentionMonths <= 0) return [];
  const parts = await listPartitions();
  const names = expiredPartitions(parts, now, retentionMonths);
  const prisma = getPrisma();
  if (names.length > 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\` DROP PARTITION ${names.map((n) => `\`${n}\``).join(", ")}`,
    );
  }
  // p_old is emptied, never dropped (rows older than the first month must stay storable)
  const old = parts.find((p) => p.name === "p_old");
  if (old && expiredPartitions([{ ...old, name: "p000000" }], now, retentionMonths).length) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` TRUNCATE PARTITION \`p_old\``);
  }
  return names;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

interface ArchivedLog {
  id: string;
  transactionId: number;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  description: string | null;
  rawData: unknown;
  createdBy: string | null;
  createdAt: string;
}

export interface ArchivedRefund {
  refundCode: string;
  amount: string;
  status: string;
  [k: string]: unknown;
}

/**
 * An archived transaction shaped like `transactions` + `logs` (newest first, at most `logLimit`),
 * flagged `archived: true`. `null` when not in the archive (or another merchant's).
 */
export async function findArchivedTransaction(
  where: { id: number } | { txnCode: string } | { merchantId: number; merchantTxnId: string },
  opts: { merchantId?: number; logLimit?: number } = {},
) {
  const row = await getPrisma().transactionArchive.findFirst({
    where: where as Prisma.TransactionArchiveWhereInput,
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  if (opts.merchantId !== undefined && row.merchantId !== opts.merchantId) return null;
  const history = (row.history ?? {}) as { logs?: ArchivedLog[]; refunds?: ArchivedRefund[] };
  const logs = (history.logs ?? [])
    .slice()
    .reverse()
    .slice(0, opts.logLimit ?? 20)
    .map((l) => ({
      ...l,
      id: BigInt(l.id),
      rawData: (l.rawData ?? null) as Prisma.JsonValue,
      createdAt: new Date(l.createdAt),
    }));
  const { archivedAt, ...rest } = row;
  const txn: Omit<typeof rest, "history"> & { history?: unknown } = { ...rest };
  delete txn.history;
  return {
    ...txn,
    status: txn.status as TxnStatusName,
    notifyWebhook: false,
    webhookSentAt: null as Date | null,
    logs,
    archived: true as const,
    archivedAt,
    archivedRefunds: history.refunds ?? [],
  };
}

type TxnStatusName = (typeof ARCHIVABLE_STATUSES)[number] | "Created" | "Pending";
