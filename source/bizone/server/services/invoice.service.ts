import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { claimIdempotencyKey, releaseIdempotencyKey, setIdempotencyDone } from "@/lib/idempotency";
import { pointsFor, rankingForSpent } from "@/lib/pos/cart";
import type { PaymentCompleted } from "@/lib/pos/protocol";
import type {
  CancelInvoiceInput,
  CreateInvoiceInput,
  CreditMethod,
  ExchangeInput,
  ExchangeQuoteInput,
  ListInvoicesInput,
  RefundInvoiceInput,
} from "@/lib/validators/pos";
import type { Prisma } from "@/generated/prisma/client";
import { enqueueStockChanged } from "@/server/queue/inventory";
import { enqueueCommissionRecalc } from "@/server/queue/commission";
import { refundTag, type PosActor } from "./cashSession.service";
import { recordAudit } from "./auditLog.service";
import { invalidateDashboardCache } from "./dashboard.service";
import { settlePayments, type SalePayment, type Settlement } from "./payment.service";
import { consumeIntents, validateIntentPayments } from "./payhubPayment.service";
import { clearCart } from "./posCart";
import { publishPosEvent } from "./posEvents";
import { quoteCart } from "./pricing.service";
import { effectiveConfig } from "./branch.service";
import type { PromotionUse } from "@/lib/pos/promotions";

export type Tx = Prisma.TransactionClient;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function ymd(d = new Date()) {
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
export async function branchWarehouseId(branchId: number): Promise<number | null> {
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
export async function moveStock(
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
export async function applyLoyalty(
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

/** Everything decided before the write transaction (prices, payments, stock location, points) */
export interface PreparedSale {
  session: { id: number; branchId: number };
  input: Pick<CreateInvoiceInput, "customerId" | "items" | "couponCode" | "notes">;
  quote: Awaited<ReturnType<typeof quoteCart>>;
  payments: SalePayment[];
  settlement: Settlement;
  warehouseId: number | null;
  prefix: string;
  points: number;
  invoiceType: "pos" | "preorder";
  /** Amount of the server-added credit line (exchange / deposit) actually used */
  creditUsed: number;
}

export interface SaleCredit {
  method: CreditMethod;
  /** Credit available; only what the new total needs is used */
  available: number;
  referenceCode: string | null;
}

/** Open session the actor may sell on */
export async function sellableSession(cashSessionId: number, actor: PosActor) {
  const session = await getPrisma().cashSession.findUnique({ where: { id: cashSessionId } });
  if (!session) throw bizoneError("NOT_FOUND", `Ca #${cashSessionId} không tồn tại`);
  if (session.status !== "open")
    throw bizoneError("CONFLICT", "Ca đã khóa — mở ca mới để bán hàng");
  if (session.userId !== actor.userId && !actor.canManage) {
    throw bizoneError("FORBIDDEN", "Không thể bán hàng trên ca của nhân viên khác");
  }
  return session;
}

/**
 * Price the sale from the DB and check how it is paid. `credit` (exchange / deposit) is added
 * as a non-cash payment line covering up to the new total.
 */
export async function prepareSale(
  input: Pick<
    CreateInvoiceInput,
    "cashSessionId" | "customerId" | "items" | "couponCode" | "notes"
  > & {
    payments: SalePayment[];
  },
  actor: PosActor,
  opts: { credit?: SaleCredit; invoiceType?: "pos" | "preorder" } = {},
): Promise<PreparedSale> {
  const session = await sellableSession(input.cashSessionId, actor);
  const quote = await quoteCart(input);
  const t = quote.totals;
  if (input.couponCode && t.couponError) throw bizoneError("VALIDATION_ERROR", t.couponError);

  const creditUsed = opts.credit ? Math.min(opts.credit.available, t.total) : 0;
  const payments: SalePayment[] = [
    ...(creditUsed > 0
      ? [
          {
            method: opts.credit!.method,
            amount: creditUsed,
            referenceCode: opts.credit!.referenceCode,
          },
        ]
      : []),
    ...(await validateIntentPayments(input.payments, session.id)),
  ];
  if (payments.length === 0)
    throw bizoneError("VALIDATION_ERROR", "Chưa chọn phương thức thanh toán");
  const settlement = settlePayments(t.total, payments);

  const warehouseId = await branchWarehouseId(session.branchId);
  // P4.6: invoice prefix may differ per branch (branch_configs → store_config)
  const cfg = await effectiveConfig(session.branchId, ["invoice_prefix", "loyalty_rate"]);
  const loyaltyRate = Number(cfg.loyalty_rate || 1);
  return {
    session: { id: session.id, branchId: session.branchId },
    input,
    quote,
    payments,
    settlement,
    warehouseId,
    prefix: cfg.invoice_prefix || "HD",
    points: quote.customer ? pointsFor(t.total, quote.customer.ranking, loyaltyRate) : 0,
    invoiceType: opts.invoiceType ?? "pos",
    creditUsed,
  };
}

/** Write the invoice, its payments, coupon/promotion usage, stock and loyalty (inside `tx`) */
export async function writeSale(tx: Tx, sale: PreparedSale, actor: PosActor) {
  const { quote, settlement, session } = sale;
  const t = quote.totals;
  const invoice = await tx.invoice.create({
    data: {
      invoiceCode: await nextCode(tx, sale.prefix),
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
      notes: sale.input.notes ?? null,
      invoiceType: sale.invoiceType,
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
        create: sale.payments.map((p) => ({
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
    if (quote.voucherId) {
      // Personal voucher: single use — the template's usage limit doesn't apply
      const v = await tx.voucher.updateMany({
        where: { id: quote.voucherId, status: "active" },
        data: { status: "used", usedAt: new Date() },
      });
      if (v.count === 0) throw bizoneError("CONFLICT", `Voucher ${t.coupon.code} vừa được sử dụng`);
      await tx.coupon.update({
        where: { id: quote.couponId },
        data: { usedCount: { increment: 1 } },
      });
    } else {
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
    }
    await tx.couponUsage.create({
      data: {
        couponId: quote.couponId,
        voucherId: quote.voucherId,
        invoiceId: invoice.id,
        customerId: quote.customer?.id ?? null,
        discountAmount: t.coupon.discount,
      },
    });
  }

  await recordPromotionUses(tx, quote.promotionUses, invoice.id, quote.customer?.id ?? null);
  await consumeIntents(tx, sale.payments, { invoiceId: invoice.id });

  let movedProducts: number[] = [];
  if (sale.warehouseId) {
    movedProducts = await moveStock(tx, {
      warehouseId: sale.warehouseId,
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
    await applyLoyalty(tx, quote.customer.id, t.total, sale.points, {
      type: "earn",
      referenceType: "invoice",
      referenceId: invoice.id,
      userId: actor.userId,
      notes: `Tích điểm hóa đơn ${invoice.invoiceCode}`,
    });
  }
  return { invoice, movedProducts };
}

/** After commit: queues, dashboard, audit and the customer display */
export async function finishSale(
  sale: PreparedSale,
  written: {
    invoice: { id: number; invoiceCode: string; userId: number; createdAt: Date };
    movedProducts: number[];
  },
  actor: PosActor,
  opts: { clearCart: boolean; audit?: Record<string, unknown> },
): Promise<CreatedInvoice> {
  const { invoice, movedProducts } = written;
  const t = sale.quote.totals;
  const result: CreatedInvoice = {
    invoiceId: invoice.id,
    invoiceCode: invoice.invoiceCode,
    amount: t.total,
    paid: sale.settlement.paid,
    change: sale.settlement.change,
    pointsEarned: sale.points,
    createdAt: invoice.createdAt.toISOString(),
  };

  if (sale.warehouseId && movedProducts.length) {
    await enqueueStockChanged({
      warehouseId: sale.warehouseId,
      productIds: movedProducts,
      reason: "sale",
      invoiceId: invoice.id,
    });
  }
  await enqueueCommissionRecalc(invoice.userId, invoice.createdAt);
  await refreshDashboard();
  await recordAudit({
    userId: actor.userId,
    module: "pos",
    action: "create",
    entityType: "invoice",
    entityId: invoice.id,
    newValue: {
      invoiceCode: invoice.invoiceCode,
      cashSessionId: sale.session.id,
      customerId: sale.quote.customer?.id ?? null,
      amount: t.total,
      items: sale.input.items.length,
      payments: sale.payments.map((p) => p.method),
      ...(sale.invoiceType !== "pos" ? { invoiceType: sale.invoiceType } : {}),
      ...opts.audit,
    },
  });
  if (opts.clearCart) {
    await clearCart(sale.session.id);
    await publishPosEvent(sale.session.id, { type: "payment:completed", data: result });
    await publishPosEvent(sale.session.id, { type: "cart:cleared", data: {} });
  } else {
    await publishPosEvent(sale.session.id, { type: "payment:completed", data: result });
  }
  return result;
}

/** Run `write` in one transaction, retrying when two tills took the same invoice number */
export async function withInvoiceNumberRetry<T>(write: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getPrisma().$transaction(write, { timeout: 15_000 });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 5) continue;
      throw e;
    }
  }
}

/** Run `fn` once per idempotency key: a retried request gets the first result back */
export async function idempotent<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = await claimIdempotencyKey<T>(key);
  if (existing?.status === "done" && existing.response) return existing.response;
  if (existing) throw bizoneError("CONFLICT", "Yêu cầu này đang được xử lý, vui lòng đợi");
  try {
    const result = await fn();
    await setIdempotencyDone(key, result);
    return result;
  } catch (e) {
    await releaseIdempotencyKey(key);
    throw e;
  }
}

/**
 * Tạo hóa đơn POS: tính lại giá từ DB, kiểm tra thanh toán, trừ tồn, ghi coupon,
 * tích điểm — tất cả trong một transaction. Idempotent theo `idempotencyKey`:
 * gửi lại cùng key trả về đúng hóa đơn đã tạo.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  actor: PosActor,
): Promise<CreatedInvoice> {
  return idempotent(
    `pos:invoice:${actor.tenantId}:${actor.userId}:${input.idempotencyKey}`,
    async () => {
      const sale = await prepareSale(input, actor);
      const written = await withInvoiceNumberRetry((tx) => writeSale(tx, sale, actor));
      return finishSale(sale, written, actor, { clearCart: true });
    },
  );
}

/** Revenue changed — drop this tenant's dashboard cache (best effort; TTL covers failures) */
export async function refreshDashboard(): Promise<void> {
  await invalidateDashboardCache().catch(() => undefined);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listInvoices(input: ListInvoicesInput) {
  const prisma = getPrisma();
  const q = input.search?.trim();
  const where: Prisma.InvoiceWhereInput = {
    ...(input.branchId ? { branchId: input.branchId } : {}),
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
  const cfg = await effectiveConfig(inv.branchId, [
    "store_name",
    "store_address",
    "store_phone",
    "receipt_footer",
  ]);
  return {
    store: {
      name: cfg.store_name,
      address: inv.branch.address || cfg.store_address,
      phone: inv.branch.phone || cfg.store_phone,
      branchName: inv.branch.name,
    },
    footer: cfg.receipt_footer || null,
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

// ─── Promotion usage (P4.4) ───────────────────────────────────────────────────

/**
 * Count flash-sale units / combo sets against their limits and log every automatic promotion
 * on the invoice. Limits are re-checked here (conditional update) — the quote may be stale.
 */
async function recordPromotionUses(
  tx: Prisma.TransactionClient,
  uses: PromotionUse[],
  invoiceId: number,
  customerId: number | null,
) {
  for (const u of uses) {
    if (u.type === "flash_sale" && u.itemRefId) {
      const item = await tx.flashSaleProduct.findUniqueOrThrow({
        where: { id: u.itemRefId },
        select: { quantityLimit: true },
      });
      const ok = await tx.flashSaleProduct.updateMany({
        where: {
          id: u.itemRefId,
          ...(item.quantityLimit > 0
            ? { soldQuantity: { lte: item.quantityLimit - u.quantity } }
            : {}),
        },
        data: { soldQuantity: { increment: u.quantity } },
      });
      if (ok.count === 0)
        throw bizoneError("CONFLICT", "Flash sale vừa hết suất — cập nhật lại giỏ hàng");
    } else if (u.type === "combo") {
      const combo = await tx.promotionCombo.findUniqueOrThrow({
        where: { id: u.promotionId },
        select: { quantityLimit: true },
      });
      const ok = await tx.promotionCombo.updateMany({
        where: {
          id: u.promotionId,
          ...(combo.quantityLimit > 0
            ? { soldCount: { lte: combo.quantityLimit - u.quantity } }
            : {}),
        },
        data: { soldCount: { increment: u.quantity } },
      });
      if (ok.count === 0)
        throw bizoneError("CONFLICT", "Combo vừa hết suất — cập nhật lại giỏ hàng");
    }
    await tx.promotionUsage.create({
      data: {
        promotionType: u.type,
        promotionId: u.promotionId,
        itemRefId: u.itemRefId,
        invoiceId,
        customerId,
        productId: u.productId,
        quantity: u.quantity,
        discountAmount: u.discount,
      },
    });
  }
}

/** Cancelled invoice: give flash-sale units / combo sets back and drop the usage rows */
async function releasePromotionUses(tx: Prisma.TransactionClient, invoiceId: number) {
  const rows = await tx.promotionUsage.findMany({ where: { invoiceId } });
  for (const r of rows) {
    if (r.promotionType === "flash_sale" && r.itemRefId) {
      await tx.flashSaleProduct.updateMany({
        where: { id: r.itemRefId, soldQuantity: { gte: r.quantity } },
        data: { soldQuantity: { decrement: r.quantity } },
      });
    } else if (r.promotionType === "combo") {
      await tx.promotionCombo.updateMany({
        where: { id: r.promotionId, soldCount: { gte: r.quantity } },
        data: { soldCount: { decrement: r.quantity } },
      });
    }
  }
  await tx.promotionUsage.deleteMany({ where: { invoiceId } });
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
      if (u.voucherId) {
        await tx.voucher.update({
          where: { id: u.voucherId },
          data: { status: "active", usedAt: null },
        });
      }
    }
    await releasePromotionUses(tx, inv.id);
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
  await enqueueCommissionRecalc(inv.userId, inv.createdAt);
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

/** Open session of the actor — refunds / exchanges are paid from it */
async function actorOpenSession(actor: PosActor, what: string) {
  const session = await getPrisma().cashSession.findFirst({
    where: { userId: actor.userId, status: "open" },
  });
  if (!session)
    throw bizoneError("CONFLICT", `Cần mở ca trước khi ${what} (tiền hoàn chi từ ca hiện tại)`);
  return session;
}

export interface PreparedRefund {
  inv: Awaited<ReturnType<typeof getInvoice>>;
  lines: {
    item: Awaited<ReturnType<typeof getInvoice>>["invoiceItems"][number];
    quantity: number;
    amount: number;
    reason: string | null;
  }[];
  total: number;
  fullyRefunded: boolean;
  warehouseId: number | null;
  pointsBack: number;
}

/**
 * Tiền hoàn tính theo giá thực trả (đã chia đều giảm giá cấp hóa đơn); kiểm số lượng còn trả được.
 * Read-only — also used to quote an exchange.
 */
export async function prepareRefund(
  invoiceId: number,
  items: { invoiceItemId: number; quantity: number; reason?: string | null }[],
): Promise<PreparedRefund> {
  const prisma = getPrisma();
  const inv = await getInvoice(invoiceId);
  if (inv.status === "cancelled")
    throw bizoneError("CONFLICT", `Hóa đơn ${inv.invoiceCode} đã hủy`);

  const itemsTotal = inv.invoiceItems.reduce((s, i) => s + Number(i.totalAmount), 0);
  const ratio = itemsTotal > 0 ? Number(inv.totalAmount) / itemsTotal : 0;

  const lines = items.map((req) => {
    const item = inv.invoiceItems.find((i) => i.id === req.invoiceItemId);
    if (!item)
      throw bizoneError(
        "VALIDATION_ERROR",
        `Dòng #${req.invoiceItemId} không thuộc hóa đơn ${inv.invoiceCode}`,
      );
    const sold = Number(item.quantity);
    const refunded = item.invoiceRefundItems.reduce((s, r) => s + Number(r.quantity), 0);
    const already = items
      .filter((r) => r.invoiceItemId === req.invoiceItemId && r !== req)
      .reduce((s, r) => s + r.quantity, 0);
    if (req.quantity + already > sold - refunded) {
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

  return {
    inv,
    lines,
    total,
    fullyRefunded,
    warehouseId: await branchWarehouseId(inv.branchId),
    pointsBack,
  };
}

async function nextRefundCode(tx: Tx): Promise<string> {
  const base = `TH${ymd()}`;
  const last = await tx.invoiceRefund.findFirst({
    where: { refundCode: { startsWith: base } },
    orderBy: { refundCode: "desc" },
    select: { refundCode: true },
  });
  const seq = last ? Number(last.refundCode.slice(base.length)) + 1 : 1;
  return `${base}${String(seq).padStart(4, "0")}`;
}

/**
 * Write the refund (inside `tx`): refund rows, payouts as negative payments tagged with the paying
 * shift, stock back in, loyalty taken back.
 */
export async function writeRefund(
  tx: Tx,
  prep: PreparedRefund,
  opts: {
    actor: PosActor;
    sessionId: number;
    reason: string | null;
    payouts: { method: string; amount: number }[];
  },
) {
  const { inv, lines, total } = prep;
  // Serialize refunds of one invoice, then re-check what is still returnable (the quantities in
  // `prep` were read before the lock — a concurrent refund may have taken some)
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${inv.id} FOR UPDATE`;
  const done = await tx.invoiceRefundItem.groupBy({
    by: ["invoiceItemId"],
    where: { refund: { invoiceId: inv.id, status: "completed" } },
    _sum: { quantity: true },
  });
  for (const l of lines) {
    const already = Number(done.find((d) => d.invoiceItemId === l.item.id)?._sum.quantity ?? 0);
    const now = lines.filter((x) => x.item.id === l.item.id).reduce((s, x) => s + x.quantity, 0);
    if (already + now > Number(l.item.quantity))
      throw bizoneError("CONFLICT", `"${l.item.product.name}" vừa được trả ở giao dịch khác`);
  }
  const refund = await tx.invoiceRefund.create({
    data: {
      invoiceId: inv.id,
      refundCode: await nextRefundCode(tx),
      reason: opts.reason,
      totalRefundAmount: total,
      status: "completed",
      createdBy: opts.actor.userId,
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
  for (const p of opts.payouts) {
    if (p.amount <= 0) continue;
    await tx.invoicePayment.create({
      data: {
        invoiceId: inv.id,
        paymentMethod: p.method,
        amount: -p.amount,
        referenceCode: refund.refundCode,
        notes: refundTag(opts.sessionId),
      },
    });
  }
  if (prep.fullyRefunded) {
    // Guarded: a concurrent refund that already finished the invoice can't be double counted
    await tx.invoice.updateMany({
      where: { id: inv.id, status: { not: "cancelled" } },
      data: { status: "refunded" },
    });
  }

  let moved: number[] = [];
  if (prep.warehouseId) {
    moved = await moveStock(tx, {
      warehouseId: prep.warehouseId,
      sign: 1,
      typeCode: "return_in",
      referenceType: "invoice_refund",
      referenceId: refund.id,
      userId: opts.actor.userId,
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
    await applyLoyalty(tx, inv.customerId, -total, -prep.pointsBack, {
      type: "adjust",
      referenceType: "invoice_refund",
      referenceId: refund.id,
      userId: opts.actor.userId,
      notes: `Thu hồi điểm do trả hàng ${refund.refundCode}`,
    });
  }
  return { refund, moved };
}

async function finishRefund(
  prep: PreparedRefund,
  written: { refund: { id: number; refundCode: string }; moved: number[] },
  actor: PosActor,
  audit: Record<string, unknown> = {},
) {
  const { inv } = prep;
  if (prep.warehouseId && written.moved.length) {
    await enqueueStockChanged({
      warehouseId: prep.warehouseId,
      productIds: written.moved,
      reason: "refund",
      invoiceId: inv.id,
    });
  }
  await enqueueCommissionRecalc(inv.userId, inv.createdAt);
  await refreshDashboard();
  await recordAudit({
    userId: actor.userId,
    module: "pos",
    action: "refund",
    entityType: "invoice",
    entityId: inv.id,
    newValue: {
      invoiceCode: inv.invoiceCode,
      refundCode: written.refund.refundCode,
      amount: prep.total,
      items: prep.lines.length,
      ...audit,
    },
  });
}

/**
 * Trả hàng: trả một phần hoặc toàn bộ, tiền hoàn chi từ ca đang mở của người thực hiện.
 * Đổi hàng (trả + mua mới, tính chênh lệch) là `exchangeInvoice`.
 */
export async function refundInvoice(input: RefundInvoiceInput, actor: PosActor) {
  const session = await actorOpenSession(actor, "đổi/trả");
  const prep = await prepareRefund(input.id, input.items);
  const written = await getPrisma().$transaction(
    (tx) =>
      writeRefund(tx, prep, {
        actor,
        sessionId: session.id,
        reason: input.reason ?? null,
        payouts: [{ method: input.refundMethod, amount: prep.total }],
      }),
    { timeout: 15_000 },
  );
  await finishRefund(prep, written, actor);
  return {
    refundId: written.refund.id,
    refundCode: written.refund.refundCode,
    totalRefundAmount: prep.total,
    invoiceStatus: prep.fullyRefunded ? "refunded" : prep.inv.status,
  };
}

// ─── Exchange (đổi hàng) ──────────────────────────────────────────────────────

/** Xem trước đổi hàng: tiền hàng trả, hoá đơn mới, chênh lệch khách trả thêm / được hoàn */
export async function exchangeQuote(input: ExchangeQuoteInput) {
  const prep = await prepareRefund(input.invoiceId, input.returnItems);
  const customerId =
    input.customerId === undefined ? prep.inv.customerId : (input.customerId ?? null);
  const quote = input.newItems.length
    ? await quoteCart({ items: input.newItems, customerId, couponCode: input.couponCode })
    : null;
  const newTotal = quote?.totals.total ?? 0;
  return {
    invoiceCode: prep.inv.invoiceCode,
    returnLines: prep.lines.map((l) => ({
      invoiceItemId: l.item.id,
      name: l.item.product.name,
      quantity: l.quantity,
      amount: l.amount,
    })),
    returnTotal: prep.total,
    newTotals: quote?.totals ?? null,
    newTotal,
    /** > 0: customer pays more; < 0: shop gives back */
    difference: newTotal - prep.total,
    pointsBack: prep.pointsBack,
  };
}

/**
 * Đổi hàng trong một transaction: phiếu trả cho hàng cũ + hoá đơn mới cho hàng mới. Giá trị hàng
 * trả cấn vào hoá đơn mới (dòng thanh toán `exchange`); khách trả thêm phần chênh lệch hoặc được
 * hoàn phần dư theo `refundMethod`. Idempotent theo `idempotencyKey`.
 */
export async function exchangeInvoice(input: ExchangeInput, actor: PosActor) {
  return idempotent(
    `pos:exchange:${actor.tenantId}:${actor.userId}:${input.idempotencyKey}`,
    async () => {
      const session = await actorOpenSession(actor, "đổi hàng");
      const prep = await prepareRefund(input.invoiceId, input.returnItems);
      const customerId =
        input.customerId === undefined ? prep.inv.customerId : (input.customerId ?? null);
      const sale = await prepareSale(
        {
          cashSessionId: session.id,
          customerId,
          items: input.newItems,
          couponCode: input.couponCode,
          notes: `Đổi hàng từ ${prep.inv.invoiceCode}`,
          payments: input.payments,
        },
        actor,
        { credit: { method: "exchange", available: prep.total, referenceCode: null } },
      );
      const giveBack = prep.total - sale.creditUsed;

      const written = await withInvoiceNumberRetry(async (tx) => {
        const r = await writeRefund(tx, prep, {
          actor,
          sessionId: session.id,
          reason: input.reason ?? "Đổi hàng",
          payouts: [
            { method: "exchange", amount: sale.creditUsed },
            { method: input.refundMethod, amount: giveBack },
          ],
        });
        // The credit line on the new invoice points at the refund it came from
        const credited: PreparedSale = {
          ...sale,
          payments: sale.payments.map((p) =>
            p.method === "exchange" ? { ...p, referenceCode: r.refund.refundCode } : p,
          ),
        };
        const s = await writeSale(tx, credited, actor);
        return { refund: r, sale: s };
      });

      await finishRefund(prep, written.refund, actor, {
        exchangeInvoiceId: written.sale.invoice.id,
      });
      const created = await finishSale(sale, written.sale, actor, {
        clearCart: false,
        audit: { exchangeFrom: prep.inv.invoiceCode, refundCode: written.refund.refund.refundCode },
      });
      return {
        ...created,
        refundCode: written.refund.refund.refundCode,
        returnTotal: prep.total,
        exchangeCredit: sale.creditUsed,
        /** Paid back to the customer (returned goods worth more than the new ones) */
        refunded: giveBack,
        refundMethod: giveBack > 0 ? input.refundMethod : null,
        originalStatus: prep.fullyRefunded ? "refunded" : prep.inv.status,
      };
    },
  );
}
