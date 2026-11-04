import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ListAuditLogsInput, CreateAuditLogInput } from "@/lib/validators/auditLog";

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  const prisma = getPrisma();
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
      newValue: input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      notes: input.notes ?? null,
    },
  });
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAuditLogs(input: ListAuditLogsInput) {
  const prisma = getPrisma();
  const { page, limit, userId, module, action, entityType, entityId, dateFrom, dateTo } = input;

  const where: Prisma.AuditLogWhereInput = {};

  if (userId) where.userId = userId;
  if (module) where.module = module;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

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
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((log) => ({
      ...log,
      id: log.id.toString(),
      entityId: log.entityId,
      oldValue: log.oldValue ? tryParseJson(log.oldValue) : null,
      newValue: log.newValue ? tryParseJson(log.newValue) : null,
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get one ─────────────────────────────────────────────────────────────────

export async function getAuditLog(id: bigint) {
  const prisma = getPrisma();
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, fullName: true } },
    },
  });
  if (!log) return null;
  return {
    ...log,
    id: log.id.toString(),
    oldValue: log.oldValue ? tryParseJson(log.oldValue) : null,
    newValue: log.newValue ? tryParseJson(log.newValue) : null,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportAuditLogsToExcel(input: Omit<ListAuditLogsInput, "page" | "limit">) {
  const prisma = getPrisma();
  const { userId, module, action, entityType, entityId, dateFrom, dateTo } = input;

  const where: Prisma.AuditLogWhereInput = {};
  if (userId) where.userId = userId;
  if (module) where.module = module;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
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

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { user: { select: { username: true, fullName: true } } },
  });

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Audit Log");

  ws.columns = [
    { header: "ID", key: "id", width: 15 },
    { header: "Thời gian", key: "time", width: 20 },
    { header: "Người dùng", key: "user", width: 25 },
    { header: "Hành động", key: "action", width: 20 },
    { header: "Module", key: "module", width: 20 },
    { header: "Đối tượng", key: "entityType", width: 25 },
    { header: "ID đối tượng", key: "entityId", width: 15 },
    { header: "IP", key: "ip", width: 18 },
    { header: "Ghi chú", key: "notes", width: 40 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };

  for (const log of logs) {
    ws.addRow({
      id: log.id.toString(),
      time: log.createdAt.toLocaleString("vi-VN"),
      user: log.user ? `${log.user.fullName ?? log.user.username}` : "—",
      action: log.action,
      module: log.module,
      entityType: log.entityType,
      entityId: log.entityId ?? "—",
      ip: log.ipAddress ?? "—",
      notes: log.notes ?? "—",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
