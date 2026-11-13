import { randomInt, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma, type DisputeSubmitChannel } from "@/generated/prisma/client";
import { publishEvent } from "@/lib/events";
import {
  ATTACHMENTS_PER_DISPUTE,
  DISPUTE_STATUSES,
  EMAIL_ATTACHMENTS_MAX_BYTES,
  answerEffect,
  canTransition,
  checkAttachment,
  disputeEligibility,
  formatDisputeCode,
  isOpen,
  parseEmailList,
  type DisputeAttachmentView,
  type DisputeDetail,
  type DisputeErrorCode,
  type DisputeLogView,
  type DisputeStatus,
  type DisputeSubmitOptions,
  type DisputeView,
  type PartnerAnswer,
  type TxnDisputeOverview,
} from "@/lib/dispute";
import {
  buildDisputeResultMail,
  buildPartnerDisputeMail,
  type DisputeMailInput,
} from "@/lib/dispute-mail";
import { mailProvider, sendMail } from "@/lib/mail";
import { getStorage } from "@/lib/storage";
import { vnRangeUtc } from "@/lib/report";
import { connectorFromPartnerConfig, disputeApiSupported } from "@/services/connectors/registry";
import { enqueueDisputeNotify } from "@/services/dispute/queue";
import { dispatchDisputeSoon } from "./webhook.service";

/**
 * Dispute module — tra soát (P5.6, SRS-PH-RECON-02, UC-RECON-02, API-Design §6.8).
 *
 * createDispute records a request (`Pending`) on a transaction — several per transaction — with
 * optional evidence files (storage: lib/storage.ts). submitDispute sends it to the partner:
 *   1. the connector's dispute API when it has one (disputeApi in registry.ts — none today),
 *   2. otherwise an e-mail with the evidence to partner_configs.dispute_email,
 *   3. otherwise the operator records that it was sent through the partner portal (`Manual`),
 * and the dispute becomes `Processing`. updateDispute records partner answers / notes and closes it
 * (`Resolved` / `Rejected` + resolution): the same DB transaction sets the `dispute.resolved` webhook
 * outbox, and after commit the result is e-mailed (worker) and pushed to the realtime channel.
 * Status changes are conditional (`UPDATE … WHERE status = <read>`), every step is a dispute_logs row.
 */

export class DisputeError extends Error {
  constructor(
    public readonly code: DisputeErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DisputeError";
  }
}

export interface DisputeActor {
  /** Admin token username — stored on the dispute and its logs */
  username: string;
  /** Token e-mail → receives the result of disputes this user created */
  email?: string | null;
  /** Token bound to one merchant: only that merchant's transactions / disputes */
  merchantId?: number;
}

export interface DisputeScope {
  merchantId?: number;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function disputeCode(now: Date): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return formatDisputeCode(now, suffix);
}

function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  } catch {
    return String(v);
  }
}

// ─── Loading & views ──────────────────────────────────────────────────────────

const DISPUTE_INCLUDE = {
  transaction: {
    select: {
      id: true,
      txnCode: true,
      status: true,
      amount: true,
      currency: true,
      merchantId: true,
      merchant: { select: { id: true, code: true, name: true } },
      partnerConfig: { select: { id: true, name: true, connectorType: true } },
    },
  },
  _count: { select: { attachments: true } },
} as const;

type DisputeRow = Prisma.DisputeGetPayload<{ include: typeof DISPUTE_INCLUDE }>;

function toView(d: DisputeRow): DisputeView {
  const t = d.transaction;
  return {
    id: d.id,
    disputeCode: d.disputeCode,
    transactionId: t.id,
    txnCode: t.txnCode,
    txnStatus: t.status,
    amount: Number(t.amount),
    currency: t.currency,
    merchant: t.merchant,
    partner: t.partnerConfig,
    reason: d.reason,
    description: d.description,
    status: d.status,
    resolution: d.resolution,
    submittedToPartner: d.submittedToPartner,
    submitChannel: d.submitChannel,
    submittedAt: d.submittedAt?.toISOString() ?? null,
    partnerRef: d.partnerRef,
    partnerResponse: d.partnerResponse ?? null,
    createdBy: d.createdByName,
    resolvedBy: d.resolvedByName,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    attachmentCount: d._count.attachments,
  };
}

async function loadDetail(id: number, scope: DisputeScope): Promise<DisputeDetail | null> {
  const prisma = getPrisma();
  const d = await prisma.dispute.findUnique({
    where: { id },
    include: {
      ...DISPUTE_INCLUDE,
      attachments: { orderBy: { id: "asc" } },
      logs: { orderBy: { id: "asc" } },
    },
  });
  if (!d || (scope.merchantId !== undefined && d.transaction.merchantId !== scope.merchantId)) {
    return null;
  }
  return {
    ...toView(d),
    attachments: d.attachments.map((a): DisputeAttachmentView => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.fileType,
      fileSize: a.fileSize,
      uploadedBy: a.uploadedBy,
      uploadedAt: a.uploadedAt.toISOString(),
    })),
    logs: d.logs.map((l): DisputeLogView => ({
      id: l.id.toString(),
      action: l.action,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      note: l.note,
      data: l.data ?? null,
      createdBy: l.createdBy,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export async function getDispute(id: number, scope: DisputeScope): Promise<DisputeDetail> {
  const d = await loadDetail(id, scope);
  if (!d) throw new DisputeError("NOT_FOUND", "Không tìm thấy yêu cầu tra soát");
  return d;
}

async function findTxn(ref: string | number, merchantId?: number) {
  const asNumber = typeof ref === "number" ? ref : /^\d+$/.test(ref) ? Number(ref) : null;
  const txn = await getPrisma().transaction.findUnique({
    where: asNumber !== null ? { id: asNumber } : { txnCode: String(ref) },
    include: { partnerConfig: true, merchant: { select: { id: true, code: true, name: true } } },
  });
  if (!txn || (merchantId !== undefined && txn.merchantId !== merchantId)) return null;
  return txn;
}

function submitOptionsOf(
  pc: { connectorType: string; disputeEmail: string | null } | null,
): DisputeSubmitOptions {
  return {
    api: disputeApiSupported(pc?.connectorType),
    email: parseEmailList(pc?.disputeEmail),
    emailLogOnly: mailProvider() === "log",
  };
}

/** Disputes of a transaction + whether a new one may be created (admin detail page / API). */
export async function getTxnDisputeOverview(
  ref: string | number,
  scope: DisputeScope,
): Promise<TxnDisputeOverview | null> {
  const txn = await findTxn(ref, scope.merchantId);
  if (!txn) return null;
  const ids = await getPrisma().dispute.findMany({
    where: { transactionId: txn.id },
    select: { id: true },
    orderBy: { id: "desc" },
  });
  const disputes = (await Promise.all(ids.map((r) => loadDetail(r.id, scope)))).filter(
    (d): d is DisputeDetail => d !== null,
  );
  return {
    eligibility: disputeEligibility(txn.status, disputes.length),
    submit: submitOptionsOf(txn.partnerConfig),
    disputes,
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface DisputeListFilter {
  /** a status, or `open` = Pending + Processing */
  status?: DisputeStatus | "open";
  /** dispute code, transaction code, partner txn id, merchant txn id or partner ticket */
  search?: string;
  /** creation day range (Vietnam time, YYYY-MM-DD) */
  from?: string;
  to?: string;
  partner?: string;
  merchantId?: number;
  page: number;
  limit: number;
}

export async function listDisputes(filter: DisputeListFilter, scope: DisputeScope) {
  const prisma = getPrisma();
  const txnWhere: Prisma.TransactionWhereInput = {};
  const merchantId = scope.merchantId ?? filter.merchantId;
  if (merchantId !== undefined) txnWhere.merchantId = merchantId;
  if (filter.partner) txnWhere.partnerConfig = { connectorType: filter.partner };

  const where: Prisma.DisputeWhereInput = { transaction: txnWhere };
  if (filter.from || filter.to) {
    const range = vnRangeUtc({ from: filter.from ?? filter.to!, to: filter.to ?? filter.from! });
    where.createdAt = { gte: range.start, lt: range.end };
  }
  const q = filter.search?.trim();
  if (q) {
    where.OR = [
      { disputeCode: { contains: q } },
      { partnerRef: { contains: q } },
      { transaction: { txnCode: { contains: q } } },
      { transaction: { partnerTxnId: { contains: q } } },
      { transaction: { merchantTxnId: { contains: q } } },
    ];
  }
  const statusWhere: Prisma.DisputeWhereInput =
    filter.status === "open"
      ? { status: { in: ["Pending", "Processing"] } }
      : filter.status
        ? { status: filter.status }
        : {};

  const [rows, total, grouped] = await Promise.all([
    prisma.dispute.findMany({
      where: { ...where, ...statusWhere },
      include: DISPUTE_INCLUDE,
      // open first (oldest waiting on top would hide new ones — newest first within the page)
      orderBy: { id: "desc" },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.dispute.count({ where: { ...where, ...statusWhere } }),
    prisma.dispute.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(DISPUTE_STATUSES.map((s) => [s, 0])) as Record<
    DisputeStatus,
    number
  >;
  for (const g of grouped) counts[g.status] = g._count._all;
  return {
    items: rows.map(toView),
    meta: { page: filter.page, limit: filter.limit, total },
    counts,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateDisputeInput {
  reason: string;
  description?: string | null;
  /** send to the partner right away (API / e-mail); attachments uploaded later are not included */
  submit?: boolean;
}

export interface SubmitReport {
  channel: DisputeSubmitChannel;
  ok: boolean;
  message: string;
  provider?: string;
}

export async function createDispute(
  txnRef: string | number,
  input: CreateDisputeInput,
  actor: DisputeActor,
): Promise<{ dispute: DisputeDetail; submit: SubmitReport | null; submitError: string | null }> {
  const prisma = getPrisma();
  const txn = await findTxn(txnRef, actor.merchantId);
  if (!txn) throw new DisputeError("NOT_FOUND", "Không tìm thấy giao dịch");

  let created: { id: number; disputeCode: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        // Serialize creations on this transaction (cap on disputes per transaction)
        await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${txn.id} FOR UPDATE`;
        const count = await tx.dispute.count({ where: { transactionId: txn.id } });
        const elig = disputeEligibility(txn.status, count);
        if (!elig.allowed) throw new DisputeError("VALIDATION_ERROR", elig.reason!);
        const code = disputeCode(new Date());
        const d = await tx.dispute.create({
          data: {
            transactionId: txn.id,
            disputeCode: code,
            reason: input.reason,
            description: input.description || null,
            status: "Pending",
            createdByName: actor.username,
            notifyEmail: actor.email || null,
          },
        });
        await tx.disputeLog.create({
          data: {
            disputeId: d.id,
            action: "created",
            toStatus: "Pending",
            note: input.reason,
            createdBy: actor.username,
          },
        });
        await tx.transactionLog.create({
          data: {
            transactionId: txn.id,
            event: "dispute_created",
            fromStatus: txn.status,
            toStatus: txn.status,
            description: `Tra soát ${code}: ${input.reason}`.slice(0, 1000),
            createdBy: actor.username,
          },
        });
        return { id: d.id, disputeCode: code };
      });
    } catch (e) {
      // Unique dispute_code collision → new random suffix
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!created) throw new Error("Could not allocate a dispute code");

  void publishEvent("dispute.updated", {
    merchantId: txn.merchantId,
    id: created.id,
    disputeCode: created.disputeCode,
    txnCode: txn.txnCode,
    status: "Pending",
  }).catch(() => {});

  let submit: SubmitReport | null = null;
  let submitError: string | null = null;
  if (input.submit) {
    try {
      submit = (await submitDispute(created.id, { mode: "auto" }, actor)).submit;
    } catch (e) {
      // The dispute is recorded; sending can be retried from its card
      submitError = e instanceof Error ? e.message : String(e);
    }
  }
  return { dispute: await getDispute(created.id, actor), submit, submitError };
}

// ─── Submit to the partner ────────────────────────────────────────────────────

export interface SubmitInput {
  /** auto = connector API, else e-mail; manual = the operator sent it through the partner portal */
  mode: "auto" | "manual";
  partnerRef?: string | null;
  note?: string | null;
}

async function loadForWork(id: number, scope: DisputeScope) {
  const d = await getPrisma().dispute.findUnique({
    where: { id },
    include: {
      transaction: {
        include: {
          partnerConfig: true,
          merchant: { select: { id: true, code: true, name: true } },
        },
      },
      attachments: { orderBy: { id: "asc" } },
    },
  });
  if (!d || (scope.merchantId !== undefined && d.transaction.merchantId !== scope.merchantId)) {
    throw new DisputeError("NOT_FOUND", "Không tìm thấy yêu cầu tra soát");
  }
  return d;
}
type WorkDispute = Awaited<ReturnType<typeof loadForWork>>;

function mailInput(d: WorkDispute, link?: string): DisputeMailInput {
  const t = d.transaction;
  return {
    disputeCode: d.disputeCode,
    reason: d.reason,
    description: d.description,
    status: d.status,
    resolution: d.resolution,
    partnerRef: d.partnerRef,
    createdBy: d.createdByName,
    resolvedBy: d.resolvedByName,
    txn: {
      txnCode: t.txnCode,
      partnerTxnId: t.partnerTxnId,
      merchantTxnId: t.merchantTxnId,
      amount: Number(t.amount),
      currency: t.currency,
      status: t.status,
      paymentMethod: t.paymentMethod,
      createdAt: t.createdAt,
      paidAt: t.paidAt,
    },
    partner: t.partnerConfig
      ? {
          name: t.partnerConfig.name,
          connectorType: t.partnerConfig.connectorType,
          merchantCode: t.partnerConfig.merchantCode,
        }
      : null,
    merchant: t.merchant,
    attachmentNames: d.attachments.map((a) => a.fileName),
    link,
  };
}

async function loadAttachmentFiles(d: WorkDispute, maxBytes: number) {
  const storage = getStorage();
  const files: { filename: string; content: Buffer; contentType: string }[] = [];
  let total = 0;
  for (const a of d.attachments) {
    total += a.fileSize ?? 0;
    if (total > maxBytes) {
      throw new DisputeError(
        "VALIDATION_ERROR",
        `Tổng dung lượng chứng từ vượt ${maxBytes / 1024 / 1024} MB — không gửi kèm email được`,
      );
    }
    const obj = await storage.get(a.filePath);
    if (!obj) throw new DisputeError("CONFLICT", `Không đọc được tệp ${a.fileName} từ kho lưu trữ`);
    files.push({
      filename: a.fileName,
      content: obj.body,
      contentType: a.fileType ?? "application/octet-stream",
    });
  }
  return files;
}

function adminLink(path: string): string | undefined {
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

async function logSubmitFailure(d: WorkDispute, channel: string, message: string, by: string) {
  await getPrisma()
    .disputeLog.create({
      data: {
        disputeId: d.id,
        action: "submit_failed",
        fromStatus: d.status,
        toStatus: d.status,
        note: message.slice(0, 2000),
        data: { channel },
        createdBy: by,
      },
    })
    .catch(() => {});
}

export async function submitDispute(
  id: number,
  input: SubmitInput,
  actor: DisputeActor,
): Promise<{ dispute: DisputeDetail; submit: SubmitReport }> {
  const d = await loadForWork(id, actor);
  if (!isOpen(d.status)) {
    throw new DisputeError("CONFLICT", "Yêu cầu tra soát đã đóng — tạo yêu cầu mới nếu cần");
  }
  const pc = d.transaction.partnerConfig;
  const options = submitOptionsOf(pc);

  let channel: DisputeSubmitChannel;
  let partnerRef: string | null = input.partnerRef?.trim() || d.partnerRef;
  let response: unknown;
  let message: string;
  let provider: string | undefined;
  let answer: PartnerAnswer | null = null;

  if (input.mode === "manual") {
    if (!input.partnerRef?.trim() && (input.note?.trim().length ?? 0) < 3) {
      throw new DisputeError(
        "VALIDATION_ERROR",
        "Nhập mã phiếu của đối tác hoặc ghi chú cách đã gửi (tối thiểu 3 ký tự)",
      );
    }
    channel = "Manual";
    response = { recordedBy: actor.username, note: input.note?.trim() || null };
    message = "Đã ghi nhận gửi đối tác thủ công";
  } else if (options.api && pc) {
    channel = "Api";
    const { connector } = connectorFromPartnerConfig(pc);
    if (!connector.submitDispute) {
      throw new DisputeError("VALIDATION_ERROR", "Connector không hỗ trợ gửi tra soát");
    }
    const files = await loadAttachmentFiles(d, EMAIL_ATTACHMENTS_MAX_BYTES);
    try {
      const r = await connector.submitDispute({
        disputeCode: d.disputeCode,
        txnCode: d.transaction.txnCode,
        partnerTxnId: d.transaction.partnerTxnId,
        amount: Number(d.transaction.amount),
        paidAt: d.transaction.paidAt,
        createdAt: d.transaction.createdAt,
        reason: d.reason,
        description: d.description,
        attachments: files,
      });
      answer = {
        accepted: r.accepted,
        status: r.outcome?.status,
        resolution: r.outcome?.resolution,
        message: r.message,
      };
      response = r.raw ?? { message: r.message ?? null };
      partnerRef = r.partnerRef ?? partnerRef;
      message = r.message ?? "Đối tác đã nhận yêu cầu tra soát";
    } catch (e) {
      const msg = `Không gửi được tới API đối tác: ${(e as Error).message}`;
      await logSubmitFailure(d, "Api", msg, actor.username);
      throw new DisputeError("PARTNER_ERROR", msg);
    }
    if (answer && !answer.accepted) {
      const msg = answerEffect(answer).kind === "refused" ? (answer.message ?? message) : message;
      await logSubmitFailure(d, "Api", msg, actor.username);
      throw new DisputeError("PARTNER_ERROR", `Đối tác từ chối yêu cầu tra soát: ${msg}`);
    }
  } else if (options.email.length > 0) {
    channel = "Email";
    const files = await loadAttachmentFiles(d, EMAIL_ATTACHMENTS_MAX_BYTES);
    const mail = buildPartnerDisputeMail(mailInput(d));
    try {
      const sent = await sendMail({
        to: options.email,
        cc: parseEmailList(process.env.DISPUTE_NOTIFY_EMAILS),
        replyTo: process.env.DISPUTE_REPLY_TO || undefined,
        ...mail,
        attachments: files,
      });
      provider = sent.provider;
      response = {
        provider: sent.provider,
        messageId: sent.messageId,
        to: options.email,
        subject: mail.subject,
        attachments: files.length,
      };
      message =
        sent.provider === "log"
          ? `Chưa cấu hình SMTP — email tới ${options.email.join(", ")} chỉ được ghi log máy chủ`
          : `Đã gửi email tới ${options.email.join(", ")}`;
    } catch (e) {
      const msg = `Không gửi được email tới đối tác: ${(e as Error).message}`;
      await logSubmitFailure(d, "Email", msg, actor.username);
      throw new DisputeError("PARTNER_ERROR", msg);
    }
  } else {
    throw new DisputeError(
      "VALIDATION_ERROR",
      `${pc?.name ?? "Đối tác"} chưa có API tra soát và chưa khai báo email tra soát — gửi qua cổng đối tác rồi chọn "Ghi nhận đã gửi"`,
    );
  }

  const effect = answer ? answerEffect(answer) : ({ kind: "processing" } as const);
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id: d.id, status: d.status },
      data: {
        status: "Processing",
        submittedToPartner: true,
        submitChannel: channel,
        submittedAt: now,
        partnerRef,
        partnerResponse: json(response),
      },
    });
    if (count === 0) {
      throw new DisputeError("CONFLICT", "Yêu cầu tra soát vừa được cập nhật — tải lại trang");
    }
    await tx.disputeLog.create({
      data: {
        disputeId: d.id,
        action: "submitted",
        fromStatus: d.status,
        toStatus: "Processing",
        note: [message, input.note?.trim()].filter(Boolean).join(" — ").slice(0, 2000),
        data: json({ channel, partnerRef, provider }),
        createdBy: actor.username,
      },
    });
  });
  if (effect.kind === "final") {
    // The partner answered immediately (API) — close it like an operator would
    await closeDispute(d.id, "Processing", effect.status, effect.resolution, {
      username: `partner:${pc?.connectorType ?? "api"}`,
    });
  } else {
    void publishEvent("dispute.updated", {
      merchantId: d.transaction.merchantId,
      id: d.id,
      disputeCode: d.disputeCode,
      txnCode: d.transaction.txnCode,
      status: "Processing",
    }).catch(() => {});
  }
  return {
    dispute: await getDispute(d.id, actor),
    submit: { channel, ok: true, message, provider },
  };
}

/** Ask the partner's dispute API for the result (connector with queryDispute). */
export async function checkDispute(id: number, actor: DisputeActor): Promise<DisputeDetail> {
  const d = await loadForWork(id, actor);
  if (d.status !== "Processing" || d.submitChannel !== "Api" || !d.partnerRef) {
    throw new DisputeError(
      "VALIDATION_ERROR",
      "Chỉ hỏi kết quả được với yêu cầu đã gửi qua API đối tác và đang chờ",
    );
  }
  const pc = d.transaction.partnerConfig;
  if (!pc) throw new DisputeError("VALIDATION_ERROR", "Giao dịch không có cấu hình đối tác");
  const { connector } = connectorFromPartnerConfig(pc);
  if (!connector.queryDispute) {
    throw new DisputeError("VALIDATION_ERROR", "Connector không hỗ trợ tra cứu kết quả tra soát");
  }
  let r;
  try {
    r = await connector.queryDispute(d.partnerRef);
  } catch (e) {
    throw new DisputeError("PARTNER_ERROR", `Không tra cứu được: ${(e as Error).message}`);
  }
  const effect = answerEffect({ accepted: true, ...r });
  await getPrisma().$transaction([
    getPrisma().dispute.update({
      where: { id: d.id },
      data: { partnerResponse: json(r.raw ?? r) },
    }),
    getPrisma().disputeLog.create({
      data: {
        disputeId: d.id,
        action: "partner_response",
        fromStatus: d.status,
        toStatus: effect.kind === "final" ? effect.status : "Processing",
        note: (r.resolution ?? r.message ?? "Đối tác đang xử lý").slice(0, 2000),
        createdBy: actor.username,
      },
    }),
  ]);
  if (effect.kind === "final") {
    await closeDispute(d.id, "Processing", effect.status, effect.resolution, {
      username: `partner:${pc.connectorType}`,
    });
  }
  return getDispute(d.id, actor);
}

// ─── Update / close ───────────────────────────────────────────────────────────

export interface UpdateDisputeInput {
  /** Processing = record a partner answer / note while waiting; Resolved / Rejected = close */
  status: "Processing" | "Resolved" | "Rejected";
  resolution?: string | null;
  note?: string | null;
  /** The note is the partner's answer (shown as "Phản hồi của đối tác") */
  fromPartner?: boolean;
  partnerRef?: string | null;
}

/** Final status + resolution + outbox in one DB transaction; notifications after commit. */
async function closeDispute(
  id: number,
  from: DisputeStatus,
  to: "Resolved" | "Rejected",
  resolution: string,
  actor: { username: string },
  extra: { note?: string | null; partnerRef?: string | null } = {},
): Promise<void> {
  const prisma = getPrisma();
  const d = await prisma.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        resolution,
        resolvedByName: actor.username,
        resolvedAt: new Date(),
        notifyWebhook: true, // dispute.resolved webhook (outbox)
        webhookSentAt: null,
        ...(extra.partnerRef ? { partnerRef: extra.partnerRef } : {}),
      },
    });
    if (count === 0) {
      throw new DisputeError("CONFLICT", "Yêu cầu tra soát vừa được cập nhật — tải lại trang");
    }
    await tx.disputeLog.create({
      data: {
        disputeId: id,
        action: "status_changed",
        fromStatus: from,
        toStatus: to,
        note: [resolution, extra.note?.trim()].filter(Boolean).join("\n").slice(0, 2000),
        createdBy: actor.username,
      },
    });
    const row = await tx.dispute.findUniqueOrThrow({
      where: { id },
      include: {
        transaction: { select: { id: true, status: true, merchantId: true, txnCode: true } },
      },
    });
    await tx.transactionLog.create({
      data: {
        transactionId: row.transaction.id,
        event: "dispute_resolved",
        fromStatus: row.transaction.status,
        toStatus: row.transaction.status,
        description: `Tra soát ${row.disputeCode} → ${to}: ${resolution}`.slice(0, 1000),
        createdBy: actor.username,
      },
    });
    return row;
  });

  dispatchDisputeSoon(id);
  await enqueueDisputeNotify(id, to).catch((e: unknown) =>
    console.error(`[dispute] notify #${id} not queued: ${(e as Error).message}`),
  );
  void publishEvent("dispute.updated", {
    merchantId: d.transaction.merchantId,
    id,
    disputeCode: d.disputeCode,
    txnCode: d.transaction.txnCode,
    status: to,
  }).catch(() => {});
}

export async function updateDispute(
  id: number,
  input: UpdateDisputeInput,
  actor: DisputeActor,
): Promise<DisputeDetail> {
  const d = await loadForWork(id, actor);
  if (!isOpen(d.status)) {
    throw new DisputeError("CONFLICT", "Yêu cầu tra soát đã đóng — tạo yêu cầu mới nếu cần");
  }
  if (!canTransition(d.status, input.status)) {
    throw new DisputeError("VALIDATION_ERROR", `Không chuyển được ${d.status} → ${input.status}`);
  }
  const note = input.note?.trim() || null;
  const partnerRef = input.partnerRef?.trim() || null;

  if (input.status === "Processing") {
    if (d.status === "Pending") {
      throw new DisputeError(
        "VALIDATION_ERROR",
        'Yêu cầu chưa gửi đối tác — dùng "Gửi đối tác" hoặc "Ghi nhận đã gửi"',
      );
    }
    if (!note && !partnerRef) {
      throw new DisputeError("VALIDATION_ERROR", "Nhập phản hồi / ghi chú hoặc mã phiếu đối tác");
    }
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.dispute.updateMany({
        where: { id, status: d.status },
        data: {
          ...(partnerRef ? { partnerRef } : {}),
          ...(input.fromPartner && note
            ? { partnerResponse: { note, by: actor.username, at: new Date().toISOString() } }
            : {}),
        },
      });
      if (count === 0) {
        throw new DisputeError("CONFLICT", "Yêu cầu tra soát vừa được cập nhật — tải lại trang");
      }
      await tx.disputeLog.create({
        data: {
          disputeId: id,
          action: input.fromPartner ? "partner_response" : "note",
          fromStatus: d.status,
          toStatus: d.status,
          note: note ?? `Mã phiếu đối tác: ${partnerRef}`,
          data: partnerRef ? { partnerRef } : undefined,
          createdBy: actor.username,
        },
      });
    });
    return getDispute(id, actor);
  }

  const resolution = input.resolution?.trim();
  if (!resolution || resolution.length < 5) {
    throw new DisputeError(
      "VALIDATION_ERROR",
      "Nhập kết quả xử lý (tối thiểu 5 ký tự) khi đóng yêu cầu tra soát",
    );
  }
  await closeDispute(id, d.status, input.status, resolution, actor, { note, partnerRef });
  return getDispute(id, actor);
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function addAttachment(
  id: number,
  file: { name: string; data: Buffer },
  actor: DisputeActor,
): Promise<DisputeAttachmentView> {
  const d = await loadForWork(id, actor);
  if (!isOpen(d.status)) {
    throw new DisputeError("CONFLICT", "Yêu cầu tra soát đã đóng — không thêm chứng từ");
  }
  if (d.attachments.length >= ATTACHMENTS_PER_DISPUTE) {
    throw new DisputeError(
      "VALIDATION_ERROR",
      `Tối đa ${ATTACHMENTS_PER_DISPUTE} tệp đính kèm cho một yêu cầu`,
    );
  }
  const check = checkAttachment(file.name, file.data.length, file.data.subarray(0, 16));
  if (!check.ok) throw new DisputeError("VALIDATION_ERROR", check.message);

  const key = `disputes/${d.disputeCode}/${randomUUID()}.${check.ext}`;
  await getStorage().put(key, file.data, check.contentType);
  try {
    const row = await getPrisma().$transaction(async (tx) => {
      const a = await tx.disputeAttachment.create({
        data: {
          disputeId: id,
          fileName: check.fileName,
          filePath: key,
          fileType: check.contentType.split(";")[0]!,
          fileSize: file.data.length,
          uploadedBy: actor.username,
        },
      });
      await tx.disputeLog.create({
        data: {
          disputeId: id,
          action: "attachment_added",
          fromStatus: d.status,
          toStatus: d.status,
          note: check.fileName,
          data: { attachmentId: a.id, size: file.data.length },
          createdBy: actor.username,
        },
      });
      return a;
    });
    return {
      id: row.id,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSize: row.fileSize,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  } catch (e) {
    await getStorage()
      .delete(key)
      .catch(() => {});
    throw e;
  }
}

async function loadAttachment(id: number, attachmentId: number, scope: DisputeScope) {
  const a = await getPrisma().disputeAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      dispute: {
        select: { id: true, status: true, transaction: { select: { merchantId: true } } },
      },
    },
  });
  if (
    !a ||
    a.disputeId !== id ||
    (scope.merchantId !== undefined && a.dispute.transaction.merchantId !== scope.merchantId)
  ) {
    throw new DisputeError("NOT_FOUND", "Không tìm thấy tệp đính kèm");
  }
  return a;
}

export async function getAttachmentFile(id: number, attachmentId: number, scope: DisputeScope) {
  const a = await loadAttachment(id, attachmentId, scope);
  const obj = await getStorage().get(a.filePath);
  if (!obj) throw new DisputeError("NOT_FOUND", "Tệp không còn trong kho lưu trữ");
  return { fileName: a.fileName, fileType: a.fileType, body: obj.body };
}

export async function removeAttachment(
  id: number,
  attachmentId: number,
  actor: DisputeActor,
): Promise<void> {
  const a = await loadAttachment(id, attachmentId, actor);
  const status = a.dispute.status;
  if (!isOpen(status)) {
    throw new DisputeError("CONFLICT", "Yêu cầu tra soát đã đóng — chứng từ được giữ nguyên");
  }
  await getPrisma().$transaction([
    getPrisma().disputeAttachment.delete({ where: { id: attachmentId } }),
    getPrisma().disputeLog.create({
      data: {
        disputeId: id,
        action: "attachment_removed",
        fromStatus: status,
        toStatus: status,
        note: a.fileName,
        createdBy: actor.username,
      },
    }),
  ]);
  await getStorage()
    .delete(a.filePath)
    .catch((e: unknown) =>
      console.error(`[dispute] storage delete ${a.filePath}: ${(e as Error).message}`),
    );
}

// ─── Result notification (worker) ─────────────────────────────────────────────

/**
 * E-mails the result of a closed dispute to its creator and DISPUTE_NOTIFY_EMAILS
 * (SRS-PH-RECON-02-08). Throws on SMTP errors so BullMQ retries; logs `notified` once sent.
 */
export async function sendDisputeResultNotification(id: number): Promise<string> {
  const d = await loadForWork(id, {});
  if (d.status !== "Resolved" && d.status !== "Rejected") return "skipped: dispute not closed";
  const to = parseEmailList(
    [d.notifyEmail, process.env.DISPUTE_NOTIFY_EMAILS].filter(Boolean).join(","),
  );
  if (to.length === 0) {
    await getPrisma().disputeLog.create({
      data: {
        disputeId: id,
        action: "notify_failed",
        fromStatus: d.status,
        toStatus: d.status,
        note: "Không có email nhận (người tạo không có email, DISPUTE_NOTIFY_EMAILS trống)",
        createdBy: "system:notify",
      },
    });
    return "skipped: no recipient";
  }
  const mail = buildDisputeResultMail(mailInput(d, adminLink(`/disputes/${id}`)));
  const sent = await sendMail({ to, ...mail });
  await getPrisma().disputeLog.create({
    data: {
      disputeId: id,
      action: "notified",
      fromStatus: d.status,
      toStatus: d.status,
      note:
        sent.provider === "log"
          ? `Email kết quả tới ${to.join(", ")} (chưa cấu hình SMTP — chỉ ghi log)`
          : `Email kết quả tới ${to.join(", ")}`,
      data: { provider: sent.provider, messageId: sent.messageId },
      createdBy: "system:notify",
    },
  });
  return `sent to ${to.join(",")} via ${sent.provider}`;
}
