import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import { assertTransition, type TxnStatus } from "./stateMachine";

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

  const txnCode = generateTxnCode();
  const expiredAt = new Date(Date.now() + (input.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES) * 60_000);

  const txn = await prisma.transaction.create({
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
    include: { logs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!txn) return null;
  if (merchantId !== undefined && txn.merchantId !== merchantId) return null;
  return txn;
}

export async function getTransactionByCode(txnCode: string, merchantId?: number) {
  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({
    where: { txnCode },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!txn) return null;
  if (merchantId !== undefined && txn.merchantId !== merchantId) return null;
  return txn;
}

export async function getTransactionByMerchantTxnId(merchantTxnId: string, merchantId: number) {
  const prisma = getPrisma();
  return prisma.transaction.findFirst({
    where: { merchantTxnId, merchantId },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
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

export async function listTransactions(input: ListTransactionsInput) {
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

  const updateData: Prisma.TransactionUpdateInput = { status: toStatus };
  if (toStatus === "Success" && !txn.paidAt) {
    updateData.paidAt = options.paidAt ?? new Date();
  }
  if (options.partnerTxnId) {
    updateData.partnerTxnId = options.partnerTxnId;
  }

  await prisma.$transaction([
    prisma.transaction.update({ where: { id: txnId }, data: updateData }),
    prisma.transactionLog.create({
      data: {
        transactionId: txnId,
        event: `status_changed:${toStatus.toLowerCase()}`,
        fromStatus,
        toStatus,
        description: options.description ?? `Status changed to ${toStatus}`,
        rawData: options.rawData ? (options.rawData as Prisma.InputJsonValue) : undefined,
        createdBy: options.createdBy ?? "system",
      },
    }),
  ]);

  void publishEvent("transaction.status_changed", {
    txnId,
    txnCode: txn.txnCode,
    fromStatus,
    toStatus,
  }).catch(() => {});

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
    select: { id: true, txnCode: true, merchantId: true },
    take: 500,
  });

  if (expired.length === 0) return 0;

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: expired.map((t) => t.id) } },
      data: { status: "Expired" },
    }),
    ...expired.map((t) =>
      prisma.transactionLog.create({
        data: {
          transactionId: t.id,
          event: "expired",
          fromStatus: "Created",
          toStatus: "Expired",
          description: "Transaction expired due to timeout",
          createdBy: "system:expire-job",
        },
      }),
    ),
  ]);

  for (const t of expired) {
    void publishEvent("transaction.expired", { txnId: t.id, txnCode: t.txnCode }).catch(() => {});
  }

  return expired.length;
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
