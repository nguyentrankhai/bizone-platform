import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { pointsFor } from "@/lib/pos/cart";
import { orderGoodsRevenue } from "@/lib/omni/website";
import { isMarketplace } from "@/lib/omni/marketplace";
import {
  applyLoyalty,
  branchWarehouseId,
  moveStock,
  nextCode,
  releaseCouponUses,
  releasePromotionUses,
  type Tx,
} from "@/server/services/invoice.service";
import { effectiveConfig } from "@/server/services/branch.service";

/**
 * Stock, promotions and revenue of online orders (P6.1, #61).
 *
 * - Website orders take their stock when they are placed (`orders.stock_warehouse_id`), so the
 *   website and every other channel see it gone at once; cancelling / returning gives it back.
 * - Orders created without taking stock (admin form, marketplaces later) take it on completion.
 * - Completing an order writes an `online` invoice (no cash session) for the goods revenue:
 *   reports, dashboard, profit & loss and staff sales read invoices, so online revenue shows up
 *   on the completion date. Loyalty points are earned on that invoice.
 */

type OrderForStock = {
  id: number;
  orderCode: string;
  branchId: number | null;
  stockWarehouseId: number | null;
  orderItems: {
    productId: number;
    variantId: number | null;
    quantity: number;
    product: { name: string };
  }[];
};

const stockItems = (o: OrderForStock) =>
  o.orderItems.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    quantity: i.quantity,
    name: i.product.name,
  }));

/** Take the order's stock from `warehouseId` (inside `tx`) — throws CONFLICT when short */
export async function takeOrderStock(
  tx: Tx,
  o: OrderForStock,
  warehouseId: number,
  userId: number | null,
) {
  const moved = await moveStock(tx, {
    warehouseId,
    sign: -1,
    typeCode: "sales_issue",
    referenceType: "order",
    referenceId: o.id,
    userId,
    note: `Xuất bán đơn ${o.orderCode}`,
    items: stockItems(o),
  });
  await tx.order.update({ where: { id: o.id }, data: { stockWarehouseId: warehouseId } });
  return moved;
}

/**
 * Cancelled / returned order: stock back to the warehouse it came from, coupon / promotion
 * uses released. Guarded so it happens once even when two requests race.
 */
export async function releaseOrderHoldings(
  tx: Tx,
  o: OrderForStock,
  userId: number | null,
  why: "cancel" | "return",
): Promise<{ warehouseId: number | null; productIds: number[] }> {
  await releaseCouponUses(tx, { orderId: o.id });
  await releasePromotionUses(tx, { orderId: o.id });
  if (!o.stockWarehouseId) return { warehouseId: null, productIds: [] };
  const claimed = await tx.order.updateMany({
    where: { id: o.id, stockWarehouseId: o.stockWarehouseId },
    data: { stockWarehouseId: null },
  });
  if (claimed.count === 0) return { warehouseId: null, productIds: [] };
  const productIds = await moveStock(tx, {
    warehouseId: o.stockWarehouseId,
    sign: 1,
    typeCode: "return_in",
    referenceType: why === "cancel" ? "order_cancel" : "order_return",
    referenceId: o.id,
    userId,
    note: `${why === "cancel" ? "Huỷ" : "Hoàn trả"} đơn ${o.orderCode}`,
    items: stockItems(o),
  });
  return { warehouseId: o.stockWarehouseId, productIds };
}

/** Load what `completeOrder` needs (outside the transaction) */
export async function loadOrderForCompletion(id: number) {
  const o = await getPrisma().order.findUnique({
    where: { id },
    include: {
      orderItems: { include: { product: { select: { name: true, costPrice: true } } } },
      payments: { where: { status: "success" }, select: { payhubTxnCode: true, amount: true } },
      customer: { select: { id: true, ranking: true } },
    },
  });
  if (!o) throw bizoneError("NOT_FOUND", `Đơn hàng #${id} không tồn tại`);
  return o;
}

type OrderForCompletion = Awaited<ReturnType<typeof loadOrderForCompletion>>;

/**
 * Write the revenue invoice of a completed order (inside `tx`). Returns the invoice and the
 * products whose stock moved now (orders that hadn't taken stock yet).
 */
export async function writeOrderInvoice(tx: Tx, o: OrderForCompletion, userId: number) {
  if (o.invoiceId) throw bizoneError("CONFLICT", "Đơn hàng đã có hoá đơn");
  const branchId =
    o.branchId ??
    (await tx.branch.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
    (await tx.branch.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id;
  if (!branchId) throw bizoneError("VALIDATION_ERROR", "Chưa có chi nhánh để ghi hoá đơn");

  let movedProducts: number[] = [];
  let warehouseId = o.stockWarehouseId;
  if (!warehouseId) {
    warehouseId = await branchWarehouseId(branchId);
    const tracked = await tx.product.count({
      where: { id: { in: o.orderItems.map((i) => i.productId) }, trackInventory: true },
    });
    if (warehouseId) movedProducts = await takeOrderStock(tx, o, warehouseId, userId);
    else if (tracked)
      throw bizoneError("VALIDATION_ERROR", "Chi nhánh chưa có kho hoạt động để trừ tồn");
  }

  const cfg = await effectiveConfig(branchId, ["invoice_prefix", "loyalty_rate"]);
  const gross = o.orderItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const total = orderGoodsRevenue({
    totalAmount: Number(o.totalAmount),
    shippingFee: Number(o.shippingFee),
  });
  const online = o.payments[0];
  // P6.2: marketplace orders are collected by the marketplace (unless COD) — Shopee / Lazada / TikTok
  const marketplace = isMarketplace(o.channel) && o.paymentMethod !== "cod" ? o.channel : null;
  const invoice = await tx.invoice.create({
    data: {
      invoiceCode: await nextCode(tx, cfg.invoice_prefix || "HD"),
      cashSessionId: null,
      customerId: o.customerId,
      userId,
      branchId,
      subtotal: gross,
      discountAmount: Math.max(0, gross - total),
      totalAmount: total,
      paidAmount: total,
      invoiceType: "online",
      notes: `Đơn ${o.channel ?? "online"} ${o.orderCode}`,
      invoiceItems: {
        create: o.orderItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          totalAmount: i.totalAmount,
          costPrice: i.product.costPrice,
        })),
      },
      invoicePayments: {
        create: [
          {
            paymentMethod: online ? "online" : (marketplace ?? "cod"),
            amount: total,
            referenceCode:
              online?.payhubTxnCode ?? (marketplace ? o.channelOrderId : null) ?? o.orderCode,
          },
        ],
      },
    },
  });
  await tx.couponUsage.updateMany({ where: { orderId: o.id }, data: { invoiceId: invoice.id } });
  await tx.promotionUsage.updateMany({ where: { orderId: o.id }, data: { invoiceId: invoice.id } });

  let points = 0;
  if (o.customer) {
    points = pointsFor(total, o.customer.ranking, Number(cfg.loyalty_rate || 1));
    await applyLoyalty(tx, o.customer.id, total, points, {
      type: "earn",
      referenceType: "invoice",
      referenceId: invoice.id,
      userId,
      notes: `Tích điểm đơn ${o.orderCode}`,
    });
  }
  return { invoice, movedProducts, warehouseId, points };
}
