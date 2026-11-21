import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import { InvalidTransitionError, assertTransition, type TxnStatus } from "./stateMachine";
import { OUTBOX_PENDING, dispatchSoon } from "./webhook.service";
import { findArchivedTransaction } from "./archive.service";
import { cachedTxnList } from "@/lib/txn-list-cache";

const DEFAULT_EXPIRY_MINUTES = 15;
const BASE_PAYMENT_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

// ─── Code generation ──────────────────────────────────────────────────────────

export function generateTxnCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `TXN-${date}-${rand}`;
}

// ─── Create ───────────────────────────────────────────────────────────────────

const TXN_CODE_ATTEMPTS = 5;

/** Unique violation on txn_code (not on merchant_txn_id — that one is the merchant's duplicate). */
export function isTxnCodeCollision(e: unknown): boolean {
  if (typeof e !== "object" || e === null || (e as { code?: string }).code !== "P2002")
    return false;
  const meta = (e as { meta?: Record<string, unknown> }).meta ?? {};
  const text = JSON.stringify(meta) + String((e as { message?: string }).message ?? "");
  return /txn_code|txnCode/.test(text) && !/merchant_txn|merchantTxnId/.test(text);
}

export interface CreateTransactionInput {
  merchantTxnId?: string;
  amount: number;
  currency?: string;
  description?: string;
  returnUrl?: string;
  webhookUrl?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  expiryMinutes?: number;
  ipAddress?: string;
}

export async function createTransaction(
  input: CreateTransactionInput,
  merchantId: number,
  apiKeyId: number,
) {
  const prisma = getPrisma();

  const expiredAt = new Date(Date.now() + (input.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES) * 60_000);

  // P7.4: txn_code has 6 random digits per day (format parsed by reconciliation / VietQR /
  // ZaloPay) — at thousands of transactions a day collisions happen; retry with a new code.
  let txnCode = generateTxnCode();
  let txn;
  for (let attempt = 1; ; attempt++) {
    try {
      txn = await insertTransaction(txnCode);
      break;
    } catch (e) {
      if (attempt >= TXN_CODE_ATTEMPTS || !isTxnCodeCollision(e)) throw e;
      txnCode = generateTxnCode();
    }
  }

  async function insertTransaction(txnCode: string) {
    return prisma.transaction.create({
      data: {
        txnCode,
        merchantId,
        apiKeyId,
        merchantTxnId: input.merchantTxnId ?? null,
        amount: input.amount,
        currency: input.currency ?? "VND",
        description: input.description ?? null,
        status: "Created",
        returnUrl: input.returnUrl ?? null,
        webhookUrl: input.webhookUrl ?? null,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        ipAddress: input.ipAddress ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
        idempotencyKey: input.idempotencyKey ?? null,
        expiredAt,
      },
    });
  }

  // Create initial state log
  await prisma.transactionLog.create({
    data: {
      transactionId: txn.id,
      event: "created",
      toStatus: "Created",
      description: "Transaction created",
      createdBy: `merchant:${merchantId}`,
    },
  });

  void publishEvent("transaction.created", { txnCode, merchantId, amount: txn.amount }).catch(
    () => {},
  );

  const paymentUrl = `${BASE_PAYMENT_URL}/pay/${txnCode}`;
  return { ...txn, paymentUrl };
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getTransactionById(id: number, merchantId?: number) {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { logs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 } },
  });
  // P7.4: moved to transactions_archive (read-only)
  if (!txn) return findArchivedTransaction({ id }, { merchantId });
  if (merchantId !== undefined && txn.merchantId !== merchantId) return null;
  return txn;
}

export async function getTransactionByCode(txnCode: string, merchantId?: number) {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({
    where: { txnCode },
    include: { logs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 } },
  });
  if (!txn) return findArchivedTransaction({ txnCode }, { merchantId });
  if (merchantId !== undefined && txn.merchantId !== merchantId) return null;
  return txn;
}

export async function getTransactionByMerchantTxnId(merchantTxnId: string, merchantId: number) {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findFirst({
    where: { merchantTxnId, merchantId },
    include: { logs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 } },
  });
  // P7.4: an archived transaction still owns its merchant_txn_id (duplicates → 409)
  return txn ?? findArchivedTransaction({ merchantId, merchantTxnId }, { logLimit: 10 });
}

/**
 * Duplicate check before creating a transaction (P7.4 — light: no logs; the archive is read only
 * when it holds rows, cached per process for a minute).
 */
export async function findMerchantTxnCode(
  merchantTxnId: string,
  merchantId: number,
): Promise<string | null> {
  const hot = await getPrisma().transaction.findFirst({
    where: { merchantTxnId, merchantId },
    select: { txnCode: true },
  });
  if (hot) return hot.txnCode;
  if (!(await archiveHasRows())) return null;
  const archived = await getPrisma().transactionArchive.findFirst({
    where: { merchantId, merchantTxnId },
    select: { txnCode: true },
  });
  return archived?.txnCode ?? null;
}

let archiveRows: { at: number; value: boolean } | null = null;

async function archiveHasRows(): Promise<boolean> {
  if (archiveRows && Date.now() - archiveRows.at < 60_000) return archiveRows.value;
  const one = await getPrisma().transactionArchive.findFirst({ select: { id: true } });
  archiveRows = { at: Date.now(), value: one !== null };
  return archiveRows.value;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface ListTransactionsInput {
  page?: number;
  limit?: number;
  status?: TxnStatus;
  merchantId?: number;
  paymentMethod?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/** P7.4: cached in Redis (lib/txn-list-cache.ts) — invalidated by every transaction event. */
export async function listTransactions(input: ListTransactionsInput) {
  return cachedTxnList(
    { ...input },
    input.merchantId,
    () => queryTransactions(input),
    reviveTxnList,
  );
}

type TxnListResult = Awaited<ReturnType<typeof queryTransactions>>;

const LIST_DATE_FIELDS = [
  "expiredAt",
  "paidAt",
  "webhookSentAt",
  "createdAt",
  "updatedAt",
] as const;

function reviveTxnList(raw: TxnListResult): TxnListResult {
  return {
    ...raw,
    items: raw.items.map((t) => {
      const out = { ...t } as Record<string, unknown>;
      for (const f of LIST_DATE_FIELDS) {
        const v = out[f];
        if (typeof v === "string") out[f] = new Date(v);
      }
      return out as (typeof raw.items)[number];
    }),
  };
}

async function queryTransactions(input: ListTransactionsInput) {
  const prisma = getPrisma();
  const {
    page = 1,
    limit = 20,
    status,
    merchantId,
    paymentMethod,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    search,
  } = input;

  const where: Prisma.TransactionWhereInput = {};
  if (status) where.status = status;
  if (merchantId) where.merchantId = merchantId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (amountMin !== undefined || amountMax !== undefined) {
    where.amount = {};
    if (amountMin !== undefined) (where.amount as Prisma.DecimalFilter).gte = amountMin;
    if (amountMax !== undefined) (where.amount as Prisma.DecimalFilter).lte = amountMax;
  }
  if (search) {
    where.OR = [
      { txnCode: { contains: search } },
      { merchantTxnId: { contains: search } },
      { customerName: { contains: search } },
      { customerEmail: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        merchant: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(serializeTxn),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── State transitions ────────────────────────────────────────────────────────

export async function transitionStatus(
  txnId: number,
  toStatus: TxnStatus,
  options: {
    description?: string;
    rawData?: unknown;
    createdBy?: string;
    partnerTxnId?: string;
    paidAt?: Date;
  } = {},
) {
  const prisma = getPrisma();

  const txn = await prisma.transaction.findUnique({ where: { id: txnId } });
  if (!txn) throw new Error("Transaction not found");

  const fromStatus = txn.status as TxnStatus;
  assertTransition(fromStatus, toStatus);

  const updateData: Prisma.TransactionUncheckedUpdateManyInput = { status: toStatus };
  if (toStatus === "Success" && !txn.paidAt) {
    updateData.paidAt = options.paidAt ?? new Date();
  }
  if (options.partnerTxnId) {
    updateData.partnerTxnId = options.partnerTxnId;
  }
  const notifies = toStatus === "Success" || toStatus === "Failed" || toStatus === "Expired";
  if (notifies) Object.assign(updateData, OUTBOX_PENDING);

  // Conditional update: only applies if nobody changed the status since we read it
  // (IPN, expire job, admin action racing). The loser gets InvalidTransitionError.
  const applied = await prisma.$transaction(async (tx) => {
    const { count } = await tx.transaction.updateMany({
      where: { id: txnId, status: fromStatus },
      data: updateData,
    });
    if (count === 0) return false;
    await tx.transactionLog.create({
      data: {
        transactionId: txnId,
        event: `status_changed:${toStatus.toLowerCase()}`,
        fromStatus,
        toStatus,
        description: options.description ?? `Status changed to ${toStatus}`,
        rawData: options.rawData ? (options.rawData as Prisma.InputJsonValue) : undefined,
        createdBy: options.createdBy ?? "system",
      },
    });
    return true;
  });

  if (!applied) {
    const fresh = await prisma.transaction.findUnique({
      where: { id: txnId },
      select: { status: true },
    });
    throw new InvalidTransitionError((fresh?.status ?? fromStatus) as TxnStatus, toStatus);
  }

  void publishEvent("transaction.status_changed", {
    txnId,
    merchantId: txn.merchantId,
    txnCode: txn.txnCode,
    fromStatus,
    toStatus,
  }).catch(() => {});
  if (notifies) dispatchSoon(txnId);

  return { ...txn, status: toStatus };
}

// ─── Expire ───────────────────────────────────────────────────────────────────

export async function expireOverdueTransactions(): Promise<number> {
  const prisma = getPrisma();
  const now = new Date();

  // Find all Created/Pending transactions past their expiry
  const expired = await prisma.transaction.findMany({
    where: {
      status: { in: ["Created", "Pending"] },
      expiredAt: { lte: now },
    },
    select: { id: true, txnCode: true, merchantId: true, status: true },
    take: 500,
  });

  if (expired.length === 0) return 0;

  // Each row is expired only if it is still in the status we read — a PSP success (IPN)
  // that lands between the read and the write must never be overwritten with Expired.
  const done: typeof expired = [];
  for (const t of expired) {
    const applied = await prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: { id: t.id, status: t.status, expiredAt: { lte: now } },
        data: { status: "Expired", ...OUTBOX_PENDING }, // payment.expired webhook (P3.6)
      });
      if (count === 0) return false;
      await tx.transactionLog.create({
        data: {
          transactionId: t.id,
          event: "expired",
          fromStatus: t.status,
          toStatus: "Expired",
          description: "Transaction expired due to timeout",
          createdBy: "system:expire-job",
        },
      });
      return true;
    });
    if (applied) done.push(t);
  }

  for (const t of done) {
    dispatchSoon(t.id);
    void publishEvent("transaction.expired", {
      txnId: t.id,
      merchantId: t.merchantId,
      txnCode: t.txnCode,
    }).catch(() => {});
  }

  return done.length;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeTxn<
  T extends { amount: { toString(): string }; refundedAmount: { toString(): string } },
>(txn: T): Omit<T, "amount" | "refundedAmount"> & { amount: string; refundedAmount: string } {
  return {
    ...txn,
    amount: txn.amount.toString(),
    refundedAmount: txn.refundedAmount.toString(),
  };
}
