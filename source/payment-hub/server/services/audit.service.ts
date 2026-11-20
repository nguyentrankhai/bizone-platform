import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { vnRangeUtc, type DateRange } from "@/lib/report";

/**
 * Reading the audit trail (P7.2) — two journals, both append-only:
 *   system       audit_logs: administrative actions (who / IP / old → new data / result)
 *   transaction  transaction_logs (+ transaction_raw_data): every lifecycle event of every
 *                transaction, with the raw API requests / responses (merchant, partner, IPN)
 * Lists are paginated (≤ 100 / page) and filtered by VN date range, action / event, user, entity.
 */

export type AuditKind = "system" | "transaction";

export interface AuditFilter {
  range: DateRange;
  /** exact action, or prefix ending with "." / "*" (e.g. "partner.") */
  action?: string;
  user?: string;
  entityType?: string;
  entityId?: string;
  result?: "success" | "failure" | "denied";
  /** free text: description / entity id / transaction code */
  q?: string;
}

export const MAX_EXPORT_ROWS = 50_000;

function actionWhere(action: string | undefined) {
  if (!action) return undefined;
  if (action.endsWith(".") || action.endsWith("*")) {
    return { startsWith: action.replace(/\*$/, "") };
  }
  return { equals: action };
}

// ─── System audit ─────────────────────────────────────────────────────────────

function systemWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const { start, end } = vnRangeUtc(f.range);
  return {
    createdAt: { gte: start, lt: end },
    ...(f.action ? { action: actionWhere(f.action) } : {}),
    ...(f.user ? { username: { contains: f.user } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.result ? { result: f.result } : {}),
    ...(f.q
      ? {
          OR: [
            { description: { contains: f.q } },
            { entityId: { contains: f.q } },
            { action: { contains: f.q } },
          ],
        }
      : {}),
  };
}

export interface SystemLogRow {
  id: string;
  createdAt: string;
  action: string;
  result: string;
  username: string | null;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  httpMethod: string | null;
  requestPath: string | null;
  description: string | null;
}

type AuditRow = Prisma.AuditLogGetPayload<object>;

function systemRow(r: AuditRow): SystemLogRow {
  return {
    id: r.id.toString(),
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    result: r.result,
    username: r.username,
    actorId: r.actorId,
    entityType: r.entityType,
    entityId: r.entityId,
    ipAddress: r.ipAddress,
    httpMethod: r.httpMethod,
    requestPath: r.requestPath,
    description: r.description,
  };
}

export async function listSystemLogs(f: AuditFilter, page: number, limit: number) {
  const prisma = getPrisma();
  const where = systemWhere(f);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: rows.map(systemRow), total };
}

export async function getSystemLog(id: bigint) {
  const r = await getPrisma().auditLog.findUnique({ where: { id } });
  if (!r) return null;
  return {
    ...systemRow(r),
    userAgent: r.userAgent,
    oldData: r.oldData,
    newData: r.newData,
  };
}

// ─── Transaction journal ──────────────────────────────────────────────────────

function transactionWhere(f: AuditFilter): Prisma.TransactionLogWhereInput {
  const { start, end } = vnRangeUtc(f.range);
  return {
    createdAt: { gte: start, lt: end },
    ...(f.action ? { event: actionWhere(f.action) } : {}),
    ...(f.user ? { createdBy: { contains: f.user } } : {}),
    ...(f.q || f.entityId
      ? { transaction: { txnCode: f.entityId ? f.entityId : { contains: f.q } } }
      : {}),
  };
}

export interface TransactionLogRow {
  id: string;
  createdAt: string;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdBy: string | null;
  description: string | null;
  transactionId: number;
  txnCode: string;
  merchantId: number;
}

const txnInclude = {
  transaction: { select: { txnCode: true, merchantId: true } },
} satisfies Prisma.TransactionLogInclude;

type TxnLogRow = Prisma.TransactionLogGetPayload<{ include: typeof txnInclude }>;

function transactionRow(r: TxnLogRow): TransactionLogRow {
  return {
    id: r.id.toString(),
    createdAt: r.createdAt.toISOString(),
    event: r.event,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    createdBy: r.createdBy,
    description: r.description,
    transactionId: r.transactionId,
    txnCode: r.transaction.txnCode,
    merchantId: r.transaction.merchantId,
  };
}

export async function listTransactionLogs(f: AuditFilter, page: number, limit: number) {
  const prisma = getPrisma();
  const where = transactionWhere(f);
  const [rows, total] = await Promise.all([
    prisma.transactionLog.findMany({
      where,
      include: txnInclude,
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transactionLog.count({ where }),
  ]);
  return { items: rows.map(transactionRow), total };
}

/** A lifecycle event + the raw API traffic of its transaction (latest 50 exchanges). */
export async function getTransactionLog(id: bigint) {
  const prisma = getPrisma();
  const r = await prisma.transactionLog.findUnique({ where: { id }, include: txnInclude });
  if (!r) return null;
  const raw = await prisma.transactionRawData.findMany({
    where: { transactionId: r.transactionId },
    orderBy: { id: "desc" },
    take: 50,
  });
  return {
    ...transactionRow(r),
    rawData: r.rawData,
    exchanges: raw.map((x) => ({
      id: x.id.toString(),
      createdAt: x.createdAt.toISOString(),
      direction: x.direction,
      source: x.source,
      endpoint: x.endpoint,
      httpStatus: x.httpStatus,
      headers: x.headers,
      body: x.body,
    })),
  };
}

// ─── Filter options ───────────────────────────────────────────────────────────

export async function auditOptions() {
  const prisma = getPrisma();
  const [actions, entities, events] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, take: 200 }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, take: 100 }),
    prisma.transactionLog.findMany({ distinct: ["event"], select: { event: true }, take: 200 }),
  ]);
  return {
    actions: actions.map((a) => a.action).sort(),
    entityTypes: entities.map((e) => e.entityType).sort(),
    events: events.map((e) => e.event).sort(),
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportTable {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
  truncated: boolean;
}

const vnTime = (iso: string) =>
  new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

const json = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v));

export async function exportRows(kind: AuditKind, f: AuditFilter): Promise<ExportTable> {
  const prisma = getPrisma();
  if (kind === "system") {
    const rows = await prisma.auditLog.findMany({
      where: systemWhere(f),
      orderBy: { id: "desc" },
      take: MAX_EXPORT_ROWS + 1,
    });
    return {
      title: "Nhật ký hệ thống",
      headers: [
        "ID",
        "Thời gian (GMT+7)",
        "Hành động",
        "Kết quả",
        "Người thực hiện",
        "IP",
        "Đối tượng",
        "Mã đối tượng",
        "Yêu cầu",
        "Mô tả",
        "Dữ liệu cũ",
        "Dữ liệu mới",
      ],
      rows: rows
        .slice(0, MAX_EXPORT_ROWS)
        .map((r) => [
          r.id.toString(),
          vnTime(r.createdAt.toISOString()),
          r.action,
          r.result,
          r.username,
          r.ipAddress,
          r.entityType,
          r.entityId,
          r.httpMethod ? `${r.httpMethod} ${r.requestPath ?? ""}` : null,
          r.description,
          json(r.oldData),
          json(r.newData),
        ]),
      truncated: rows.length > MAX_EXPORT_ROWS,
    };
  }
  const rows = await prisma.transactionLog.findMany({
    where: transactionWhere(f),
    include: txnInclude,
    orderBy: { id: "desc" },
    take: MAX_EXPORT_ROWS + 1,
  });
  return {
    title: "Nhật ký giao dịch",
    headers: [
      "ID",
      "Thời gian (GMT+7)",
      "Mã GD",
      "Merchant",
      "Sự kiện",
      "Từ",
      "Sang",
      "Thực hiện bởi",
      "Mô tả",
      "Dữ liệu",
    ],
    rows: rows
      .slice(0, MAX_EXPORT_ROWS)
      .map((r) => [
        r.id.toString(),
        vnTime(r.createdAt.toISOString()),
        r.transaction.txnCode,
        r.transaction.merchantId,
        r.event,
        r.fromStatus,
        r.toStatus,
        r.createdBy,
        r.description,
        json(r.rawData),
      ]),
    truncated: rows.length > MAX_EXPORT_ROWS,
  };
}

/** CSV with a BOM (Excel opens UTF-8 correctly); cells that look like formulas are quoted. */
export function toCsv(t: ExportTable): Buffer {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.headers, ...t.rows].map((r) => r.map(cell).join(","));
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

export async function toXlsx(t: ExportTable): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.title.slice(0, 31));
  ws.addRow(t.headers).font = { bold: true };
  for (const r of t.rows) {
    ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v)));
  }
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 10 : i >= t.headers.length - 2 ? 60 : 22;
  });
  if (t.truncated) ws.addRow([`… chỉ xuất ${MAX_EXPORT_ROWS} dòng mới nhất — thu hẹp bộ lọc`]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
