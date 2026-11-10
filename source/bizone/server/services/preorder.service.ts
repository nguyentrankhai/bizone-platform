import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CancelPreorderInput,
  CompletePreorderInput,
  CreatePreorderInput,
  ListPreordersInput,
} from "@/lib/validators/pos";
import type { PosActor } from "./cashSession.service";
import { recordAudit } from "./auditLog.service";
import {
  finishSale,
  idempotent,
  prepareSale,
  sellableSession,
  withInvoiceNumberRetry,
  writeSale,
  ymd,
  type Tx,
} from "./invoice.service";
import { settlePayments } from "./payment.service";
import { consumeIntents, validateIntentPayments } from "./payhubPayment.service";
import { clearCart } from "./posCart";
import { publishPosEvent } from "./posEvents";
import { quoteCart } from "./pricing.service";

/**
 * Đơn đặt trước có đặt cọc tại POS (SRS-POS-09, P4.5).
 *
 * - Đặt: lưu SP + giá tạm tính, thu cọc vào ca hiện tại (không trừ tồn, không ghi doanh thu).
 * - Giao: tạo hoá đơn thường (`invoice_type = preorder`) ở ca đang mở, giá tính lại tại thời điểm
 *   giao; cọc cấn trừ bằng dòng thanh toán `deposit`, khách trả phần còn lại. Doanh thu, trừ tồn,
 *   tích điểm, khuyến mãi theo hoá đơn này như mọi hoá đơn POS.
 * - Huỷ: hoàn cọc (toàn bộ / một phần / giữ cọc) từ ca đang mở.
 *
 * Tiền cọc vào két ở ca nhận cọc (`preorders.cash_session_id`), tiền hoàn cọc / hoàn phần cọc dư ra
 * ở ca đóng đơn (`closed_session_id`) — xem `sessionSummary`.
 */

const include = {
  customer: { select: { id: true, fullName: true, phone: true } },
  branch: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
    },
  },
} satisfies Prisma.PreorderInclude;

async function nextPreorderCode(tx: Tx): Promise<string> {
  const base = `DC${ymd()}`;
  const last = await tx.preorder.findFirst({
    where: { preorderCode: { startsWith: base } },
    orderBy: { preorderCode: "desc" },
    select: { preorderCode: true },
  });
  const seq = last ? Number(last.preorderCode.slice(base.length)) + 1 : 1;
  return `${base}${String(seq).padStart(4, "0")}`;
}

function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function getPreorder(id: number) {
  const p = await getPrisma().preorder.findUnique({ where: { id }, include });
  if (!p) throw bizoneError("NOT_FOUND", `Đơn đặt trước #${id} không tồn tại`);
  return p;
}

export async function listPreorders(input: ListPreordersInput) {
  const prisma = getPrisma();
  const q = input.search?.trim();
  const where: Prisma.PreorderWhereInput = {
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(q
      ? {
          OR: [
            { preorderCode: { contains: q } },
            { customer: { phone: { contains: q } } },
            { customer: { fullName: { contains: q } } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.preorder.findMany({
      where,
      include,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.preorder.count({ where }),
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

/** Đặt trước + thu cọc */
export async function createPreorder(input: CreatePreorderInput, actor: PosActor) {
  return idempotent(
    `pos:preorder:${actor.tenantId}:${actor.userId}:${input.idempotencyKey}`,
    async () => {
      const session = await sellableSession(input.cashSessionId, actor);
      const quote = await quoteCart(input);
      const t = quote.totals;
      if (!quote.customer) throw bizoneError("VALIDATION_ERROR", "Đơn đặt trước cần khách hàng");
      if (input.couponCode && t.couponError) throw bizoneError("VALIDATION_ERROR", t.couponError);
      if (input.deposit.amount > t.total)
        throw bizoneError(
          "VALIDATION_ERROR",
          `Tiền cọc không được vượt giá trị đơn (${t.total.toLocaleString("vi-VN")}₫)`,
        );
      // Deposit is taken exactly — no change on a deposit
      settlePayments(input.deposit.amount, [input.deposit]);
      const [deposit] = await validateIntentPayments([input.deposit], session.id);

      let created;
      for (let attempt = 1; ; attempt++) {
        try {
          created = await getPrisma().$transaction(async (tx) => {
            const p = await tx.preorder.create({
              data: {
                preorderCode: await nextPreorderCode(tx),
                branchId: session.branchId,
                cashSessionId: session.id,
                customerId: quote.customer!.id,
                userId: actor.userId,
                estimatedTotal: t.total,
                depositAmount: deposit.amount,
                depositMethod: deposit.method,
                depositReference: deposit.referenceCode ?? null,
                dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
                notes: input.notes ?? null,
                // Gift lines are regenerated by the promotion engine when the order is handed over
                items: {
                  create: t.lines
                    .filter((l) => !l.isGift)
                    .map((l) => ({
                      productId: l.productId,
                      variantId: l.variantId,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                      discountPercent: l.discountPercent,
                      totalAmount: l.totalAmount,
                    })),
                },
              },
            });
            await consumeIntents(tx, [deposit], { preorderId: p.id });
            return p;
          });
          break;
        } catch (e) {
          if (isUniqueViolation(e) && attempt < 5) continue;
          throw e;
        }
      }

      await recordAudit({
        userId: actor.userId,
        module: "pos",
        action: "preorder_create",
        entityType: "preorder",
        entityId: created.id,
        newValue: {
          preorderCode: created.preorderCode,
          customerId: created.customerId,
          estimatedTotal: t.total,
          deposit: deposit.amount,
          depositMethod: deposit.method,
          dueDate: input.dueDate ?? null,
        },
      });
      if (input.fromCart) {
        await clearCart(session.id);
        await publishPosEvent(session.id, { type: "cart:cleared", data: {} });
      }
      return {
        id: created.id,
        preorderCode: created.preorderCode,
        estimatedTotal: t.total,
        depositAmount: deposit.amount,
        remaining: t.total - deposit.amount,
      };
    },
  );
}

/** Báo giá lúc giao: giá hiện tại của các SP đã đặt, cọc cấn trừ, còn phải trả */
export async function preorderQuote(id: number) {
  const p = await getPreorder(id);
  const quote = await quoteCart({
    customerId: p.customerId,
    items: p.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: Number(i.quantity),
      discountPercent: Number(i.discountPercent),
    })),
  });
  const total = quote.totals.total;
  const deposit = Number(p.depositAmount);
  return {
    preorder: p,
    totals: quote.totals,
    deposit,
    remaining: Math.max(0, total - deposit),
    /** Deposit larger than the final price → given back on completion */
    excessDeposit: Math.max(0, deposit - total),
  };
}

/** Giao hàng đặt trước: hoá đơn + cấn cọc + thu phần còn lại */
export async function completePreorder(input: CompletePreorderInput, actor: PosActor) {
  return idempotent(
    `pos:preorder-done:${actor.tenantId}:${actor.userId}:${input.idempotencyKey}`,
    async () => {
      const p = await getPreorder(input.id);
      if (p.status !== "pending")
        throw bizoneError(
          "CONFLICT",
          `Đơn ${p.preorderCode} đã ${p.status === "completed" ? "giao" : "huỷ"}`,
        );
      const deposit = Number(p.depositAmount);
      const sale = await prepareSale(
        {
          cashSessionId: input.cashSessionId,
          customerId: p.customerId,
          items: p.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: Number(i.quantity),
            discountPercent: Number(i.discountPercent),
          })),
          couponCode: null,
          notes: `Giao đơn đặt trước ${p.preorderCode}`,
          payments: input.payments,
        },
        actor,
        {
          credit: { method: "deposit", available: deposit, referenceCode: p.preorderCode },
          invoiceType: "preorder",
        },
      );
      const excess = deposit - sale.creditUsed;

      const written = await withInvoiceNumberRetry(async (tx) => {
        const s = await writeSale(tx, sale, actor);
        const done = await tx.preorder.updateMany({
          where: { id: p.id, status: "pending" },
          data: {
            status: "completed",
            invoiceId: s.invoice.id,
            closedSessionId: sale.session.id,
            completedAt: new Date(),
            refundAmount: excess,
            refundMethod: excess > 0 ? input.refundMethod : null,
          },
        });
        if (done.count === 0)
          throw bizoneError("CONFLICT", "Đơn đặt trước vừa được xử lý ở nơi khác");
        return s;
      });

      const created = await finishSale(sale, written, actor, {
        clearCart: false,
        audit: { preorderCode: p.preorderCode, deposit: sale.creditUsed },
      });
      return {
        ...created,
        preorderCode: p.preorderCode,
        depositApplied: sale.creditUsed,
        excessRefunded: excess,
      };
    },
  );
}

/** Huỷ đơn đặt trước, hoàn cọc từ ca đang mở của người thực hiện */
export async function cancelPreorder(input: CancelPreorderInput, actor: PosActor) {
  const prisma = getPrisma();
  const p = await getPreorder(input.id);
  if (p.status !== "pending")
    throw bizoneError(
      "CONFLICT",
      `Đơn ${p.preorderCode} đã ${p.status === "completed" ? "giao" : "huỷ"}`,
    );
  if (p.userId !== actor.userId && !actor.canManage)
    throw bizoneError("FORBIDDEN", "Chỉ người nhận đơn hoặc quản lý mới được huỷ đơn đặt trước");
  const deposit = Number(p.depositAmount);
  const refundAmount = input.refundAmount ?? deposit;
  if (refundAmount > deposit)
    throw bizoneError(
      "VALIDATION_ERROR",
      `Tiền hoàn không được vượt tiền cọc (${deposit.toLocaleString("vi-VN")}₫)`,
    );
  const session = await prisma.cashSession.findFirst({
    where: { userId: actor.userId, status: "open" },
  });
  if (!session && refundAmount > 0)
    throw bizoneError("CONFLICT", "Cần mở ca trước khi hoàn cọc (tiền hoàn chi từ ca hiện tại)");

  const res = await prisma.preorder.updateMany({
    where: { id: p.id, status: "pending" },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      refundAmount,
      refundMethod: refundAmount > 0 ? input.refundMethod : null,
      closedSessionId: session?.id ?? null,
      notes: [p.notes, `Huỷ: ${input.reason ?? "không ghi lý do"}`].filter(Boolean).join("\n"),
    },
  });
  if (res.count === 0) throw bizoneError("CONFLICT", "Đơn đặt trước vừa được xử lý ở nơi khác");
  await recordAudit({
    userId: actor.userId,
    module: "pos",
    action: "preorder_cancel",
    entityType: "preorder",
    entityId: p.id,
    oldValue: { status: p.status },
    newValue: {
      preorderCode: p.preorderCode,
      status: "cancelled",
      refundAmount,
      refundMethod: refundAmount > 0 ? input.refundMethod : null,
      reason: input.reason ?? null,
    },
  });
  return getPreorder(p.id);
}
