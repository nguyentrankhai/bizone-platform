import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { claimIdempotencyKey, releaseIdempotencyKey, setIdempotencyDone } from "@/lib/idempotency";
import { pointsFor, rankingForSpent } from "@/lib/pos/cart";
import type { PaymentCompleted } from "@/lib/pos/protocol";
import type {
  CancelInvoiceInput,
  CreateInvoiceInput,
  ListInvoicesInput,
  RefundInvoiceInput,
} from "@/lib/validators/pos";
import type { Prisma } from "@/generated/prisma/client";
import { enqueueStockChanged } from "@/server/queue/inventory";
import { refundTag, type PosActor } from "./cashSession.service";
import { recordAudit } from "./auditLog.service";
import { invalidateDashboardCache } from "./dashboard.service";
import { settlePayments } from "./payment.service";
import { clearCart } from "./posCart";
import { publishPosEvent } from "./posEvents";
import { quoteCart } from "./pricing.service";

type Tx = Prisma.TransactionClient;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function storeConfig(keys: string[]) {
  const rows = await getPrisma().storeConfig.findMany({ where: { configKey: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.configKey, r.configValue ?? ""]));
}

function ymd(d = new Date()) {
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function nextCode(tx: Tx, prefix: string): Promise<string> {
  const base = `${prefix}${ymd()}`;
  const last = await tx.invoice.findFirst({
    where: { invoiceCode: { startsWith: base } },
    orderBy: { invoiceCode: "desc" },
    select: { invoiceCode: true },
  });
  const seq = last ? Number(last.invoiceCode.slice(base.length)) + 1 : 1;
  return `${base}${String(seq).padStart(4, "0")}`;
}

function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Sales deduct from the branch's first active warehouse */
async function branchWarehouseId(branchId: number): Promise<number | null> {
  const wh = await getPrisma().warehouse.findFirst({
    where: { branchId, isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return wh?.id ?? null;
}

async function txTypeId(tx: Tx, code: string) {
  const t = await tx.inventoryTransactionType.findUnique({ where: { code }, select: { id: true } });
  if (!t) throw bizoneError("INTERNAL_ERROR", `Thiếu loại phiếu kho "${code}" (chạy db:seed)`);
  return t.id;
}

/**
 * Move stock for tracked products and record a confirmed inventory note.
 * `sign` -1 = out (sale), +1 = back in (refund/cancel). Decrements are guarded
 * in SQL (quantity >= n) so two concurrent sales can never oversell.
 */
async function moveStock(
  tx: Tx,
  opts: {
    warehouseId: number;
    sign: 1 | -1;
    typeCode: string;
    referenceType: string;
    referenceId: number;
    userId: number;
    note: string;
    items: { productId: number; variantId: number | null; quantity: number; name: string }[];
  },
) {
  const tracked = await tx.product.findMany({
    where: { id: { in: opts.items.map((i) => i.productId) }, trackInventory: true },
    select: { id: true },
  });
  const items = opts.items.filter((i) => tracked.some((t) => t.id === i.productId));
  if (items.length === 0) return [];

  for (const it of items) {
    const where = {
      productId: it.productId,
      warehouseId: opts.warehouseId,
      variantId: it.variantId,
    };
    if (opts.sign < 0) {
      const res = await tx.inventory.updateMany({
        where: { ...where, quantity: { gte: it.quantity } },
        data: { quantity: { decrement: it.quantity } },
      });
      if (res.count === 0) {
        const cur = await tx.inventory.findFirst({ where, select: { quantity: true } });
        throw bizoneError(
          "CONFLICT",
          `"${it.name}" chỉ còn ${Number(cur?.quantity ?? 0)} trong kho, không đủ bán ${it.quantity}`,
        );
      }
    } else {
      const res = await tx.inventory.updateMany({
        where,
        data: { quantity: { increment: it.quantity } },
      });
      if (res.count === 0) await tx.inventory.create({ data: { ...where, quantity: it.quantity } });
    }
  }

  await tx.inventoryTransaction.create({
    data: {
      transactionCode: `TX-${ymd()}-${opts.referenceType.toUpperCase().slice(0, 3)}${opts.referenceId}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      transactionTypeId: await txTypeId(tx, opts.typeCode),
      warehouseId: opts.warehouseId,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      notes: opts.note,
      createdBy: opts.userId,
      status: "confirmed",
      inventoryTransactionItems: {
        create: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      },
    },
  });
  return items.map((i) => i.productId);
}

/** Add (or remove, with negative values) spending and points, then re-rank the customer */
async function applyLoyalty(
  tx: Tx,
  customerId: number,
  spentDelta: number,
  pointsDelta: number,
  ref: {
    type: "earn" | "adjust";
    referenceType: string;
    referenceId: number;
    userId: number;
    notes: string;
  },
) {
  const c = await tx.customer.update({
    where: { id: customerId },
    data: { totalSpent: { increment: spentDelta }, totalPoints: { increment: pointsDelta } },
    select: { totalSpent: true, totalPoints: true, ranking: true },
  });
  const ranking = rankingForSpent(Number(c.totalSpent));
  if (ranking !== c.ranking || c.totalPoints < 0) {
    await tx.customer.update({
      where: { id: customerId },
      data: { ranking, ...(c.totalPoints < 0 ? { totalPoints: 0 } : {}) },
    });
  }
  if (pointsDelta !== 0) {
    await tx.customerLoyaltyPoint.create({
      data: {
        customerId,
        points: pointsDelta,
        type: ref.type,
        referenceType: ref.referenceType,
        referenceId: ref.referenceId,
        notes: ref.notes,
        createdBy: ref.userId,
      },
    });
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreatedInvoice = PaymentCompleted & { createdAt: string };

/**
 * Tạo hóa đơn POS: tính lại giá từ DB, kiểm tra thanh toán, trừ tồn, ghi coupon,
 * tích điểm — tất cả trong một transaction. Idempotent theo `idempotencyKey`:
 * gửi lại cùng key trả về đúng hóa đơn đã tạo.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  actor: PosActor,
): Promise<CreatedInvoice> {
  const idemKey = `pos:invoice:${actor.tenantId}:${actor.userId}:${input.idempotencyKey}`;
  const existing = await claimIdempotencyKey<CreatedInvoice>(idemKey);
  if (existing?.status === "done" && existing.response) return existing.response;
  if (existing) throw bizoneError("CONFLICT", "Hóa đơn này đang được xử lý, vui lòng đợi");

  try {
    const result = await createInvoiceOnce(input, actor);
    await setIdempotencyDone(idemKey, result);
    return result;
  } catch (e) {
    await releaseIdempotencyKey(idemKey);
    throw e;
  }
}

async function createInvoiceOnce(
  input: CreateInvoiceInput,
  actor: PosActor,
): Promise<CreatedInvoice> {
  const prisma = getPrisma();
  const session = await prisma.cashSession.findUnique({ where: { id: input.cashSessionId } });
  if (!session) throw bizoneError("NOT_FOUND", `Ca #${input.cashSessionId} không tồn tại`);
  if (session.status !== "open")
    throw bizoneError("CONFLICT", "Ca đã khóa — mở ca mới để bán hàng");
  if (session.userId !== actor.userId && !actor.canManage) {
    throw bizoneError("FORBIDDEN", "Không thể bán hàng trên ca của nhân viên khác");
  }

  const quote = await quoteCart(input);
  const t = quote.totals;
  if (input.couponCode && t.couponError) throw bizoneError("VALIDATION_ERROR", t.couponError);
  const settlement = settlePayments(t.total, input.payments);

  const warehouseId = await branchWarehouseId(session.branchId);
  const cfg = await storeConfig(["invoice_prefix", "loyalty_rate"]);
  const prefix = cfg.invoice_prefix || "HD";
  const loyaltyRate = Number(cfg.loyalty_rate || 1);
  const points = quote.customer ? pointsFor(t.total, quote.customer.ranking, loyaltyRate) : 0;

  for (let attempt = 1; ; attempt++) {
    try {
      const { invoice, movedProducts } = await prisma.$transaction(
        async (tx) => {
          const invoice = await tx.invoice.create({
            data: {
              invoiceCode: await nextCode(tx, prefix),
              cashSessionId: session.id,
              customerId: quote.customer?.id ?? null,
              userId: actor.userId,
              branchId: session.branchId,
              subtotal: t.subtotal,
              discountAmount: t.discountAmount,
              discountPercent: t.memberDiscountPercent,
              taxAmount: t.taxAmount,
              totalAmount: t.total,
              paidAmount: settlement.paid,
              changeAmount: settlement.change,
              notes: input.notes ?? null,
              invoiceItems: {
                create: t.lines.map((l) => ({
                  productId: l.productId,
                  variantId: l.variantId,
                  unitName: l.unit,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  discountPercent: l.discountPercent,
                  discountAmount: l.discountAmount,
                  taxAmount: l.taxAmount,
                  totalAmount: l.totalAmount,
                })),
              },
              invoicePayments: {
                create: input.payments.map((p) => ({
                  paymentMethod: p.method,
                  amount: p.amount,
                  referenceCode: p.referenceCode ?? null,
                })),
              },
            },
          });

          // Cost price snapshot for profit reports
          const costs = await tx.product.findMany({
            where: { id: { in: t.lines.map((l) => l.productId) } },
            select: { id: true, costPrice: true },
          });
          for (const c of costs) {
            await tx.invoiceItem.updateMany({
              where: { invoiceId: invoice.id, productId: c.id },
              data: { costPrice: c.costPrice },
            });
          }

          if (quote.couponId && t.coupon) {
            // Prisma can't compare two columns, so guard on the limit read in this transaction
            const { usageLimit } = await tx.coupon.findUniqueOrThrow({
              where: { id: quote.couponId },
              select: { usageLimit: true },
            });
            const used = await tx.coupon.updateMany({
              where: {
                id: quote.couponId,
                ...(usageLimit !== null ? { usedCount: { lt: usageLimit } } : {}),
              },
              data: { usedCount: { increment: 1 } },
            });
            if (used.count === 0)
              throw bizoneError("CONFLICT", `Mã ${t.coupon.code} vừa hết lượt sử dụng`);
            await tx.couponUsage.create({
              data: {
                couponId: quote.couponId,
                invoiceId: invoice.id,
                customerId: quote.customer?.id ?? null,
                discountAmount: t.coupon.discount,
              },
            });
          }

          let movedProducts: number[] = [];
          if (warehouseId) {
            movedProducts = await moveStock(tx, {
              warehouseId,
              sign: -1,
              typeCode: "sales_issue",
              referenceType: "invoice",
              referenceId: invoice.id,
              userId: actor.userId,
              note: `Bán hàng ${invoice.invoiceCode}`,
              items: t.lines,
            });
          } else if (
            await tx.product.count({
              where: { id: { in: t.lines.map((l) => l.productId) }, trackInventory: true },
            })
          ) {
            throw bizoneError("VALIDATION_ERROR", "Chi nhánh chưa có kho hoạt động để trừ tồn");
          }

          if (quote.customer) {
            await applyLoyalty(tx, quote.customer.id, t.total, points, {
              type: "earn",
              referenceType: "invoice",
              referenceId: invoice.id,
              userId: actor.userId,
              notes: `Tích điểm hóa đơn ${invoice.invoiceCode}`,
            });
          }
          return { invoice, movedProducts };
        },
        { timeout: 15_000 },
      );

      const result: CreatedInvoice = {
        invoiceId: invoice.id,
        invoiceCode: invoice.invoiceCode,
        amount: t.total,
        paid: settlement.paid,
        change: settlement.change,
        pointsEarned: points,
        createdAt: invoice.createdAt.toISOString(),
      };

      if (warehouseId && movedProducts.length) {
        await enqueueStockChanged({
          warehouseId,
          productIds: movedProducts,
          reason: "sale",
          invoiceId: invoice.id,
        });
      }
      await refreshDashboard();
      await recordAudit({
        userId: actor.userId,
        module: "pos",
        action: "create",
        entityType: "invoice",
        entityId: invoice.id,
        newValue: {
          invoiceCode: invoice.invoiceCode,
          cashSessionId: session.id,
          customerId: input.customerId ?? null,
          amount: t.total,
          items: input.items.length,
          payments: input.payments.map((p) => p.method),
        },
      });
      await clearCart(session.id);
      await publishPosEvent(session.id, { type: "payment:completed", data: result });
      await publishPosEvent(session.id, { type: "cart:cleared", data: {} });
      return result;
    } catch (e) {
      // Two cashiers took the same sequence number — retry with the next one
      if (isUniqueViolation(e) && attempt < 5) continue;
      throw e;
    }
  }
}

/** Revenue changed — drop this tenant's dashboard cache (best effort; TTL covers failures) */
async function refreshDashboard(): Promise<void> {
  await invalidateDashboardCache().catch(() => undefined);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listInvoices(input: ListInvoicesInput) {
  const prisma = getPrisma();
  const q = input.search?.trim();
  const where: Prisma.InvoiceWhereInput = {
    ...(input.cashSessionId ? { cashSessionId: input.cashSessionId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(q
      ? { OR: [{ invoiceCode: { contains: q } }, { customer: { phone: { contains: q } } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        user: { select: { id: true, fullName: true } },
        _count: { select: { invoiceItems: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.invoice.count({ where }),
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

export async function getInvoice(id: number) {
  const inv = await getPrisma().invoice.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true, address: true, phone: true } },
      customer: {
        select: { id: true, fullName: true, phone: true, ranking: true, totalPoints: true },
      },
      user: { select: { id: true, fullName: true } },
      invoiceItems: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, sku: true } },
          invoiceRefundItems: {
            where: { refund: { status: "completed" } },
            select: { quantity: true },
          },
        },
      },
      invoicePayments: true,
      invoiceRefunds: { include: { invoiceRefundItems: true } },
      couponUsage: { include: { coupon: { select: { code: true, name: true } } } },
    },
  });
  if (!inv) throw bizoneError("NOT_FOUND", `Hóa đơn #${id} không tồn tại`);
  return inv;
}

/** Dữ liệu in hóa đơn nhiệt: thông tin cửa hàng + hóa đơn đã làm phẳng */
export async function printData(id: number) {
  const inv = await getInvoice(id);
  const cfg = await storeConfig(["store_name", "store_address", "store_phone"]);
  return {
    store: {
      name: cfg.store_name,
      address: inv.branch.address ?? cfg.store_address,
      phone: inv.branch.phone ?? cfg.store_phone,
    },
    invoiceCode: inv.invoiceCode,
    createdAt: inv.createdAt,
    cashier: inv.user.fullName,
    customer: inv.customer ? { name: inv.customer.fullName, phone: inv.customer.phone } : null,
    items: inv.invoiceItems.map((i) => ({
      name: i.product.name,
      sku: i.variant?.sku ?? i.product.sku,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount),
      total: Number(i.totalAmount),
    })),
    subtotal: Number(inv.subtotal),
    discountAmount: Number(inv.discountAmount),
    taxAmount: Number(inv.taxAmount),
    total: Number(inv.totalAmount),
    payments: inv.invoicePayments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
    paid: Number(inv.paidAmount),
    change: Number(inv.changeAmount),
    status: inv.status,
  };
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

/**
 * Hủy hóa đơn trong ca đang mở (sai sót ngay tại quầy): hoàn tồn, thu hồi điểm và
 * lượt coupon. Hóa đơn của ca đã khóa phải đi luồng đổi/trả.
 */
export async function cancelInvoice(input: CancelInvoiceInput, actor: PosActor) {
  const prisma = getPrisma();
  const inv = await prisma.invoice.findUnique({
    where: { id: input.id },
    include: {
      cashSession: true,
      invoiceItems: { include: { product: { select: { name: true } } } },
      couponUsage: true,
      invoiceRefunds: { where: { status: "completed" }, select: { id: true } },
    },
  });
  if (!inv) throw bizoneError("NOT_FOUND", `Hóa đơn #${input.id} không tồn tại`);
  if (inv.status !== "active")
    throw bizoneError(
      "CONFLICT",
      `Hóa đơn ${inv.invoiceCode} đã ${inv.status === "cancelled" ? "hủy" : "đổi/trả"}`,
    );
  if (inv.invoiceRefunds.length)
    throw bizoneError("CONFLICT", "Hóa đơn đã có phiếu đổi/trả, không thể hủy");
  if (!inv.cashSession || inv.cashSession.status !== "open") {
    throw bizoneError("CONFLICT", "Ca của hóa đơn đã khóa — dùng chức năng đổi/trả");
  }
  if (inv.userId !== actor.userId && !actor.canManage) {
    throw bizoneError("FORBIDDEN", "Chỉ người lập hoặc quản lý mới được hủy hóa đơn");
  }

  const warehouseId = await branchWarehouseId(inv.branchId);
  const earned = inv.customerId
    ? await prisma.customerLoyaltyPoint.aggregate({
        where: { referenceType: "invoice", referenceId: inv.id, customerId: inv.customerId },
        _sum: { points: true },
      })
    : null;

  const moved = await prisma.$transaction(async (tx) => {
    const res = await tx.invoice.updateMany({
      where: { id: inv.id, status: "active" },
      data: {
        status: "cancelled",
        notes: [inv.notes, `Hủy: ${input.reason ?? "không ghi lý do"}`].filter(Boolean).join("\n"),
      },
    });
    if (res.count === 0) throw bizoneError("CONFLICT", "Hóa đơn vừa được xử lý ở nơi khác");

    for (const u of inv.couponUsage) {
      await tx.couponUsage.delete({ where: { id: u.id } });
      await tx.coupon.update({ where: { id: u.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    let moved: number[] = [];
    if (warehouseId) {
      moved = await moveStock(tx, {
        warehouseId,
        sign: 1,
        typeCode: "return_in",
        referenceType: "invoice_cancel",
        referenceId: inv.id,
        userId: actor.userId,
        note: `Hủy hóa đơn ${inv.invoiceCode}`,
        items: inv.invoiceItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: Number(i.quantity),
          name: i.product.name,
        })),
      });
    }
    if (inv.customerId) {
      await applyLoyalty(
        tx,
        inv.customerId,
        -Number(inv.totalAmount),
        -(earned?._sum.points ?? 0),
        {
          type: "adjust",
          referenceType: "invoice_cancel",
          referenceId: inv.id,
          userId: actor.userId,
          notes: `Thu hồi điểm do hủy ${inv.invoiceCode}`,
        },
      );
    }
    return moved;
  });

  if (warehouseId && moved.length) {
    await enqueueStockChanged({
      warehouseId,
      productIds: moved,
      reason: "cancel",
      invoiceId: inv.id,
    });
  }
  await refreshDashboard();
  await recordAudit({
    userId: actor.userId,
    module: "pos",
    action: "cancel",
    entityType: "invoice",
    entityId: inv.id,
    oldValue: { status: inv.status },
    newValue: { invoiceCode: inv.invoiceCode, status: "cancelled", reason: input.reason ?? null },
  });
  return getInvoice(inv.id);
}

// ─── Refund (đổi/trả) ─────────────────────────────────────────────────────────

/**
 * Đổi/trả: trả một phần hoặc toàn bộ. Tiền hoàn tính theo giá thực trả (đã chia đều
 * giảm giá cấp hóa đơn), chi từ ca đang mở của người thực hiện. Đổi hàng = trả +
 * hóa đơn mới.
 */
export async function refundInvoice(input: RefundInvoiceInput, actor: PosActor) {
  const prisma = getPrisma();
  const session = await prisma.cashSession.findFirst({
    where: { userId: actor.userId, status: "open" },
  });
  if (!session)
    throw bizoneError("CONFLICT", "Cần mở ca trước khi đổi/trả (tiền hoàn chi từ ca hiện tại)");

  const inv = await getInvoice(input.id);
  if (inv.status === "cancelled")
    throw bizoneError("CONFLICT", `Hóa đơn ${inv.invoiceCode} đã hủy`);

  const itemsTotal = inv.invoiceItems.reduce((s, i) => s + Number(i.totalAmount), 0);
  const ratio = itemsTotal > 0 ? Number(inv.totalAmount) / itemsTotal : 0;

  const lines = input.items.map((req) => {
    const item = inv.invoiceItems.find((i) => i.id === req.invoiceItemId);
    if (!item)
      throw bizoneError(
        "VALIDATION_ERROR",
        `Dòng #${req.invoiceItemId} không thuộc hóa đơn ${inv.invoiceCode}`,
      );
    const sold = Number(item.quantity);
    const refunded = item.invoiceRefundItems.reduce((s, r) => s + Number(r.quantity), 0);
    if (req.quantity > sold - refunded) {
      throw bizoneError(
        "VALIDATION_ERROR",
        `"${item.product.name}" chỉ còn ${sold - refunded} có thể trả`,
      );
    }
    const amount = Math.round((Number(item.totalAmount) / sold) * req.quantity * ratio);
    return { item, quantity: req.quantity, amount, reason: req.reason ?? null };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const fullyRefunded = inv.invoiceItems.every((i) => {
    const already = i.invoiceRefundItems.reduce((s, r) => s + Number(r.quantity), 0);
    const now = lines.filter((l) => l.item.id === i.id).reduce((s, l) => s + l.quantity, 0);
    return already + now >= Number(i.quantity);
  });

  const warehouseId = await branchWarehouseId(inv.branchId);
  const earned = inv.customerId
    ? await prisma.customerLoyaltyPoint.aggregate({
        where: { referenceType: "invoice", referenceId: inv.id, customerId: inv.customerId },
        _sum: { points: true },
      })
    : null;
  const pointsBack =
    Number(inv.totalAmount) > 0
      ? Math.round(((earned?._sum.points ?? 0) * total) / Number(inv.totalAmount))
      : 0;

  const { refund, moved } = await prisma.$transaction(async (tx) => {
    const count = await tx.invoiceRefund.count({
      where: { refundCode: { startsWith: `TH${ymd()}` } },
    });
    const refund = await tx.invoiceRefund.create({
      data: {
        invoiceId: inv.id,
        refundCode: `TH${ymd()}${String(count + 1).padStart(4, "0")}`,
        reason: input.reason ?? null,
        totalRefundAmount: total,
        status: "completed",
        createdBy: actor.userId,
        invoiceRefundItems: {
          create: lines.map((l) => ({
            invoiceItemId: l.item.id,
            productId: l.item.productId,
            quantity: l.quantity,
            refundAmount: l.amount,
            reason: l.reason,
          })),
        },
      },
    });
    await tx.invoicePayment.create({
      data: {
        invoiceId: inv.id,
        paymentMethod: input.refundMethod,
        amount: -total,
        referenceCode: refund.refundCode,
        notes: refundTag(session.id),
      },
    });
    if (fullyRefunded)
      await tx.invoice.update({ where: { id: inv.id }, data: { status: "refunded" } });

    let moved: number[] = [];
    if (warehouseId) {
      moved = await moveStock(tx, {
        warehouseId,
        sign: 1,
        typeCode: "return_in",
        referenceType: "invoice_refund",
        referenceId: refund.id,
        userId: actor.userId,
        note: `Trả hàng ${refund.refundCode} (${inv.invoiceCode})`,
        items: lines.map((l) => ({
          productId: l.item.productId,
          variantId: l.item.variantId,
          quantity: l.quantity,
          name: l.item.product.name,
        })),
      });
    }
    if (inv.customerId) {
      await applyLoyalty(tx, inv.customerId, -total, -pointsBack, {
        type: "adjust",
        referenceType: "invoice_refund",
        referenceId: refund.id,
        userId: actor.userId,
        notes: `Thu hồi điểm do trả hàng ${refund.refundCode}`,
      });
    }
    return { refund, moved };
  });

  if (warehouseId && moved.length) {
    await enqueueStockChanged({
      warehouseId,
      productIds: moved,
      reason: "refund",
      invoiceId: inv.id,
    });
  }
  await refreshDashboard();
  await recordAudit({
    userId: actor.userId,
    module: "pos",
    action: "refund",
    entityType: "invoice",
    entityId: inv.id,
    newValue: {
      invoiceCode: inv.invoiceCode,
      refundCode: refund.refundCode,
      amount: total,
      items: input.items.length,
    },
  });
  return {
    refundId: refund.id,
    refundCode: refund.refundCode,
    totalRefundAmount: total,
    invoiceStatus: fullyRefunded ? "refunded" : inv.status,
  };
}
