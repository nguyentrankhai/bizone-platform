import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { TransactionStatus } from "@/generated/prisma/client";
import { getRedis } from "@/lib/redis";
import { publishEvent } from "@/lib/events";
import { decryptSecret } from "@/lib/crypto";
import {
  buildVietQrPayload,
  noteForTxnCode,
  renderQrPng,
  validateAccount,
  VietQrError,
  type QrSize,
  type VietQrAccount,
} from "@/services/qr/vietqr";

/**
 * QR generation for Payment Hub transactions (P3.4, SRS-PH-TXN-02).
 *
 * - One active QR per (transaction, type, size). A repeated request returns the active QR
 *   (Redis cache → DB); an expired one is replaced by a fresh QR ("auto refresh").
 * - QR expiry = min(now + expiresInSeconds, transaction.expired_at).
 * - PNG is stored base64 in qr_codes and, for `image_url`, in Redis under an unguessable token
 *   with the QR's TTL — the public URL `/qr/{token}.png` stops working when the QR expires.
 * - Generating a QR moves the transaction Created → Pending (payment_method = vietqr).
 *
 * The bank account comes from the Active partner config `connector_type = 'VietQR'`
 * (see VIETQR_CONFIG_FIELDS for how its columns are used).
 */

export const QR_TYPES = ["VietQR", "NapasQR", "PartnerQR"] as const;
export type QrType = (typeof QR_TYPES)[number];
/** Types implemented so far — NapasQR / PartnerQR (MoMo, ZaloPay…) arrive with their connectors. */
export const SUPPORTED_QR_TYPES: readonly QrType[] = ["VietQR"];

export const QR_DEFAULT_EXPIRES_SECONDS = Number(process.env.QR_EXPIRES_SECONDS ?? 900);
export const QR_MIN_EXPIRES_SECONDS = 60;
export const QR_MAX_EXPIRES_SECONDS = 86_400;
/** A cached QR this close to expiry is refreshed instead of handed out. */
const MIN_REMAINING_MS = 5_000;

const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
const PAYABLE = ["Created", "Pending"];

/**
 * partner_configs columns for connector_type = 'VietQR' (no PSP API → no real key/secret):
 *   api_key       → bank BIN (encrypted like every api_key)
 *   merchant_code → beneficiary account number
 *   secret_key    → account holder name (encrypted)
 */
export const VIETQR_CONFIG_FIELDS = [
  { key: "api_key", label: "Mã BIN ngân hàng (NAPAS)", type: "string", required: true },
  { key: "merchant_code", label: "Số tài khoản nhận", type: "string", required: true },
  { key: "secret_key", label: "Tên chủ tài khoản", type: "string", required: true },
] as const;

export class QrError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "QrError";
  }
}

export interface GenerateQrOptions {
  type: QrType;
  size: QrSize;
  expiresInSeconds?: number;
}

export interface QrDto {
  qr_id: number;
  transaction_id: string;
  type: QrType;
  size: number;
  raw_data: string;
  image_base64: string;
  image_url: string | null;
  amount: string;
  transfer_note: string;
  bank: { bin: string; account_no: string; account_name: string | null };
  expires_at: string;
  created_at: string;
}

export interface GenerateQrResult {
  qr: QrDto;
  /** true when an existing active QR was returned */
  reused: boolean;
  /** true when this call replaced an expired QR */
  refreshed: boolean;
  cached: boolean;
  transactionStatus: string;
}

const cacheKey = (txnId: number, type: string, size: number) =>
  `payhub:qr:${txnId}:${type}:${size}`;
export const imageKey = (token: string) => `payhub:qr:img:${token}`;

async function bestEffort<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[qr] redis: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function loadVietQrAccount(): Promise<{ account: VietQrAccount; partnerConfigId: number }> {
  const pc = await getPrisma().partnerConfig.findFirst({
    where: { connectorType: "VietQR", status: "Active" },
    orderBy: { id: "asc" },
  });
  if (!pc || !pc.merchantCode) {
    throw new QrError("SERVICE_UNAVAILABLE", "VietQR is not configured");
  }
  const account: VietQrAccount = {
    bin: decryptSecret(pc.apiKey),
    accountNo: pc.merchantCode,
    accountName: decryptSecret(pc.secretKey) || undefined,
  };
  try {
    validateAccount(account);
  } catch (e) {
    console.error(`[qr] partner config #${pc.id} is invalid: ${(e as Error).message}`);
    throw new QrError("SERVICE_UNAVAILABLE", "VietQR is not configured correctly");
  }
  return { account, partnerConfigId: pc.id };
}

async function findTransaction(merchantId: number, ref: string) {
  const prisma = getPrisma();
  const asId = /^\d+$/.test(ref) ? Number(ref) : NaN;
  return prisma.transaction.findFirst({
    where: Number.isSafeInteger(asId) ? { id: asId, merchantId } : { txnCode: ref, merchantId },
  });
}

/** Generate (or return the active) QR for a merchant's transaction. */
export async function generateQr(
  merchantId: number,
  transactionRef: string,
  opts: GenerateQrOptions,
): Promise<GenerateQrResult> {
  if (!SUPPORTED_QR_TYPES.includes(opts.type)) {
    throw new QrError("VALIDATION_ERROR", `QR type ${opts.type} is not supported yet`);
  }

  const txn = await findTransaction(merchantId, transactionRef);
  if (!txn) throw new QrError("NOT_FOUND", "Transaction not found");
  if (!PAYABLE.includes(txn.status)) {
    throw new QrError("CONFLICT", `Transaction is ${txn.status}`);
  }
  const now = new Date();
  if (txn.expiredAt && txn.expiredAt <= now) {
    throw new QrError("CONFLICT", "Transaction has expired");
  }
  if (txn.currency !== "VND") {
    throw new QrError("VALIDATION_ERROR", "VietQR only supports VND");
  }

  // Fast path: active QR in Redis
  const redis = getRedis();
  const key = cacheKey(txn.id, opts.type, opts.size);
  const cachedRaw = await bestEffort(() => redis.get(key));
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw) as QrDto;
    if (new Date(cached.expires_at).getTime() - now.getTime() > MIN_REMAINING_MS) {
      return {
        qr: cached,
        reused: true,
        refreshed: false,
        cached: true,
        transactionStatus: txn.status,
      };
    }
  }

  const { account, partnerConfigId } = await loadVietQrAccount();
  const amount = Number(txn.amount);
  const note = noteForTxnCode(txn.txnCode);
  let payload: string;
  try {
    payload = buildVietQrPayload({ account, amount, note });
  } catch (e) {
    if (e instanceof VietQrError) throw new QrError("VALIDATION_ERROR", e.message);
    throw e;
  }

  const ttlSeconds = Math.min(
    Math.max(opts.expiresInSeconds ?? QR_DEFAULT_EXPIRES_SECONDS, QR_MIN_EXPIRES_SECONDS),
    QR_MAX_EXPIRES_SECONDS,
  );
  let expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  if (txn.expiredAt && txn.expiredAt < expiresAt) expiresAt = txn.expiredAt;
  expiresAt.setMilliseconds(0); // DATETIME(0)

  // Rendering is deterministic from the payload — do it outside the DB transaction.
  const png = await renderQrPng(payload, opts.size);
  const imageBase64 = `data:image/png;base64,${png.toString("base64")}`;
  const token = randomBytes(16).toString("hex");
  const imageUrl = `${APP_URL}/qr/${token}.png`;

  const prisma = getPrisma();
  const outcome = await prisma.$transaction(async (tx) => {
    // Serialise concurrent generate calls for the same transaction.
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM transactions WHERE id = ${txn.id} FOR UPDATE`;
    const status = locked[0]?.status;
    if (!status || !PAYABLE.includes(status)) {
      return { kind: "conflict" as const, status: status ?? "missing" };
    }

    const active = await tx.qrCode.findFirst({
      where: {
        transactionId: txn.id,
        qrType: opts.type,
        size: opts.size,
        isExpired: false,
        expiresAt: { gt: new Date(Date.now() + MIN_REMAINING_MS) },
      },
      orderBy: { id: "desc" },
    });
    if (active) return { kind: "reused" as const, row: active, status };

    // Earlier QR of the same kind (already flagged by the expiry job, or expiring now) →
    // this call is a refresh.
    const previous = await tx.qrCode.count({
      where: { transactionId: txn.id, qrType: opts.type, size: opts.size },
    });
    await tx.qrCode.updateMany({
      where: { transactionId: txn.id, qrType: opts.type, size: opts.size, isExpired: false },
      data: { isExpired: true, imageBase64: null },
    });

    const row = await tx.qrCode.create({
      data: {
        transactionId: txn.id,
        qrType: opts.type,
        rawData: payload,
        imageBase64,
        imageUrl,
        size: opts.size,
        expiresAt,
      },
    });

    await tx.transaction.updateMany({
      where: { id: txn.id, status: status as TransactionStatus },
      data: { status: "Pending", paymentMethod: "vietqr", partnerConfigId },
    });
    await tx.transactionLog.create({
      data: {
        transactionId: txn.id,
        event: status === "Created" ? "status_changed:pending" : "qr_generated",
        fromStatus: status,
        toStatus: "Pending",
        description: `${opts.type} ${opts.size}px ${previous ? "refreshed" : "generated"} (expires ${expiresAt.toISOString()})`,
        createdBy: "system:qr",
      },
    });
    return { kind: "created" as const, row, status, refreshed: previous > 0 };
  });

  if (outcome.kind === "conflict") {
    throw new QrError("CONFLICT", `Transaction is ${outcome.status}`);
  }

  const row = outcome.row;
  const dto: QrDto = {
    qr_id: row.id,
    transaction_id: txn.txnCode,
    type: row.qrType as QrType,
    size: row.size,
    raw_data: row.rawData ?? payload,
    image_base64: row.imageBase64 ?? imageBase64,
    image_url: row.imageUrl,
    amount: txn.amount.toString(),
    transfer_note: note,
    bank: {
      bin: account.bin,
      account_no: account.accountNo,
      account_name: account.accountName ?? null,
    },
    expires_at: (row.expiresAt ?? expiresAt).toISOString(),
    created_at: row.createdAt.toISOString(),
  };

  const ttlMs = new Date(dto.expires_at).getTime() - Date.now();
  if (ttlMs > 0) {
    await bestEffort(async () => {
      const pipe = redis.multi().set(key, JSON.stringify(dto), "PX", ttlMs);
      if (outcome.kind === "created") pipe.set(imageKey(token), png, "PX", ttlMs);
      await pipe.exec();
    });
  }

  if (outcome.kind === "created" && outcome.status === "Created") {
    void publishEvent("transaction.status_changed", {
      txnId: txn.id,
      merchantId: txn.merchantId,
      txnCode: txn.txnCode,
      fromStatus: "Created",
      toStatus: "Pending",
    }).catch(() => {});
  }

  return {
    qr: dto,
    reused: outcome.kind === "reused",
    refreshed: outcome.kind === "created" && outcome.refreshed,
    cached: false,
    transactionStatus: "Pending",
  };
}

/** PNG bytes for a public image token, or null once the QR has expired. */
export async function getQrImage(token: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return (await getRedis().getBuffer(imageKey(token))) ?? null;
}

/**
 * Mark QR codes expired (past expires_at, or their transaction is no longer payable) and
 * drop the stored image (SRS §: temporary QR data is removed after expiry/completion).
 */
export async function expireQrCodes(): Promise<number> {
  const { count } = await getPrisma().qrCode.updateMany({
    where: {
      isExpired: false,
      OR: [
        { expiresAt: { lte: new Date() } },
        { transaction: { status: { notIn: ["Created", "Pending"] } } },
      ],
    },
    data: { isExpired: true, imageBase64: null },
  });
  return count;
}
