import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import type { CloseSessionInput, ListSessionsInput, OpenSessionInput } from "@/lib/validators/pos";
import { CREDIT_METHODS } from "@/lib/validators/pos";
import { sumByMethod } from "./payment.service";
import { unusedPaidIntents } from "./payhubPayment.service";
import { publishPosEvent } from "./posEvents";

/** Who is acting: the local users.id and whether they may act on other cashiers' shifts */
export interface PosActor {
  userId: number;
  tenantId: string;
  canManage: boolean;
}

/** Refund payouts are stored as negative invoice_payments tagged with the paying shift */
export const refundTag = (sessionId: number) => `cash_session:${sessionId}`;

export async function openSession(input: OpenSessionInput, actor: PosActor) {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || branch.status !== "active") {
    throw bizoneError(
      "NOT_FOUND",
      `Chi nhánh #${input.branchId} không tồn tại hoặc ngừng hoạt động`,
    );
  }
  const open = await prisma.cashSession.findFirst({
    where: { userId: actor.userId, status: "open" },
  });
  if (open)
    throw bizoneError("CONFLICT", `Bạn đang có ca #${open.id} chưa khóa`, { sessionId: open.id });

  return prisma.cashSession.create({
    data: { branchId: input.branchId, userId: actor.userId, openingBalance: input.openingBalance },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
}

export async function getCurrentSession(actor: PosActor) {
  return getPrisma().cashSession.findFirst({
    where: { userId: actor.userId, status: "open" },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
}

export async function getSession(id: number) {
  const s = await getPrisma().cashSession.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, username: true, fullName: true } },
      _count: { select: { invoices: true } },
    },
  });
  if (!s) throw bizoneError("NOT_FOUND", `Ca #${id} không tồn tại`);
  return s;
}

export async function listSessions(input: ListSessionsInput) {
  const prisma = getPrisma();
  const where = {
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.cashSession.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { openedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.cashSession.count({ where }),
  ]);
  return {
    items,
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

/** Tổng kết ca: doanh số, tiền theo phương thức, hoàn trả, tiền mặt dự kiến trong két */
export async function sessionSummary(id: number) {
  const prisma = getPrisma();
  const session = await getSession(id);

  const [invoices, salePayments, refundPayments, deposits, depositRefunds, payhubUnused] =
    await Promise.all([
      prisma.invoice.groupBy({
        by: ["status"],
        where: { cashSessionId: id },
        _count: { _all: true },
        _sum: { totalAmount: true, discountAmount: true, changeAmount: true },
        orderBy: { status: "asc" },
      }),
      prisma.invoicePayment.findMany({
        where: { amount: { gt: 0 }, invoice: { cashSessionId: id, status: { not: "cancelled" } } },
        select: { paymentMethod: true, amount: true },
      }),
      prisma.invoicePayment.findMany({
        where: { amount: { lt: 0 }, notes: refundTag(id) },
        select: { paymentMethod: true, amount: true },
      }),
      // P4.5: pre-order deposits taken in this shift / deposits given back from it
      prisma.preorder.findMany({
        where: { cashSessionId: id },
        select: { depositMethod: true, depositAmount: true },
      }),
      prisma.preorder.findMany({
        where: { closedSessionId: id, refundAmount: { gt: 0 } },
        select: { refundMethod: true, refundAmount: true },
      }),
      unusedPaidIntents(id),
    ]);

  const byStatus = (s: string) => invoices.find((g) => g.status === s);
  const counted = invoices.filter((g) => g.status !== "cancelled");
  const revenue = counted.reduce((s, g) => s + Number(g._sum?.totalAmount ?? 0), 0);
  const discounts = counted.reduce((s, g) => s + Number(g._sum?.discountAmount ?? 0), 0);
  const change = counted.reduce((s, g) => s + Number(g._sum?.changeAmount ?? 0), 0);
  // Credit lines (exchange value, applied deposits) are not money changing hands in this shift
  const isCredit = (m: string) => (CREDIT_METHODS as readonly string[]).includes(m);
  const allReceived = sumByMethod(salePayments);
  const allRefunds = sumByMethod(refundPayments);
  const received = Object.fromEntries(Object.entries(allReceived).filter(([m]) => !isCredit(m)));
  const refunds = Object.fromEntries(Object.entries(allRefunds).filter(([m]) => !isCredit(m)));
  const credits = Object.fromEntries(Object.entries(allReceived).filter(([m]) => isCredit(m)));
  const depositIn = sumByMethod(
    deposits.map((d) => ({ paymentMethod: d.depositMethod, amount: d.depositAmount })),
  );
  const depositOut = sumByMethod(
    depositRefunds.map((d) => ({
      paymentMethod: d.refundMethod ?? "cash",
      amount: d.refundAmount,
    })),
  );

  const opening = Number(session.openingBalance);
  const expectedCash =
    opening +
    (received.cash ?? 0) -
    change +
    (refunds.cash ?? 0) +
    (depositIn.cash ?? 0) -
    (depositOut.cash ?? 0);

  return {
    sessionId: id,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    openingBalance: opening,
    invoiceCount: counted.reduce(
      (s, g) => s + (typeof g._count === "object" ? (g._count._all ?? 0) : 0),
      0,
    ),
    cancelledCount: (() => {
      const c = byStatus("cancelled")?._count;
      return typeof c === "object" ? (c._all ?? 0) : 0;
    })(),
    revenue,
    discounts,
    received,
    change,
    // Stored negative; report as positive amounts (and avoid -0 when there were none)
    refunds: Object.fromEntries(Object.entries(refunds).map(([k, v]) => [k, Math.abs(v)])),
    refundTotal: Math.abs(Object.values(refunds).reduce((s, v) => s + v, 0)),
    /** Exchange credit / applied deposits on this shift's invoices (no money moved) */
    credits,
    deposits: depositIn,
    depositTotal: Object.values(depositIn).reduce((s, v) => s + v, 0),
    depositRefunds: depositOut,
    depositRefundTotal: Object.values(depositOut).reduce((s, v) => s + v, 0),
    /** Paid through Payment Hub but not attached to any invoice — reconcile before closing */
    payhubUnused,
    expectedCash,
    actualClosingBalance:
      session.actualClosingBalance === null ? null : Number(session.actualClosingBalance),
    difference: session.difference === null ? null : Number(session.difference),
  };
}

export async function closeSession(input: CloseSessionInput, actor: PosActor) {
  const prisma = getPrisma();
  const session = await getSession(input.sessionId);
  if (session.status !== "open") throw bizoneError("CONFLICT", `Ca #${session.id} đã khóa`);
  if (session.userId !== actor.userId && !actor.canManage) {
    throw bizoneError("FORBIDDEN", "Chỉ người mở ca hoặc quản lý mới được khóa ca");
  }

  const summary = await sessionSummary(session.id);
  const difference = input.actualClosingBalance - summary.expectedCash;
  // Guard on status so two concurrent close requests can't both win
  const updated = await prisma.cashSession.updateMany({
    where: { id: session.id, status: "open" },
    data: {
      status: "closed",
      closedAt: new Date(),
      closingBalance: summary.expectedCash,
      actualClosingBalance: input.actualClosingBalance,
      difference,
      notes: input.notes ?? null,
    },
  });
  if (updated.count === 0) throw bizoneError("CONFLICT", `Ca #${session.id} đã khóa`);

  const final = await sessionSummary(session.id);
  await publishPosEvent(session.id, {
    type: "session:status",
    data: { status: "closed", summary: final },
  });
  return final;
}
