import { TRPCError } from "@trpc/server";
import { getPrisma } from "@/lib/prisma";
import { ORDER_SOURCE_LABEL, normalizeOrderSource } from "@/lib/omni/marketplace";
import { bizoneError } from "@/lib/errors";
import { currentTenantId } from "@/lib/tenant";
import {
  isStorefrontUrl,
  ORDER_STATUS_LABEL,
  parseWebTxnId,
  productSlug,
  shippingFeeFor,
  WEBSITE_CHANNEL,
  webTxnIdOf,
  type WebsitePaymentMethod,
} from "@/lib/omni/website";
import { quoteCart } from "@/server/services/pricing.service";
import {
  branchWarehouseId,
  idempotent,
  recordCouponUse,
  recordPromotionUses,
} from "@/server/services/invoice.service";
import { generateCustomerCode } from "@/server/services/customer.service";
import { cancelOrderNow } from "@/server/services/order.service";
import { notify } from "@/server/services/notification.service";
import { fmtVnd } from "@/lib/notifications/template";
import { enqueueStockChanged } from "@/server/queue/inventory";
import {
  createPayhubTransaction,
  getPayhubTransaction,
  PaymentHubError,
  payhubConfig,
} from "@/server/services/payment/paymentHubClient";
import { takeOrderStock } from "./orderFulfillment.service";
import { stockForLines } from "./storeCatalog.service";
import { logSync, reportSyncFailure, type StoreChannel } from "./websiteChannel.service";
import type { OrderPayment } from "@/generated/prisma/client";

/**
 * Website orders (P6.1): priced exactly like the POS (`quoteCart`, channel "website"), saved in
 * the Orders module (channel "website", branch of the channel — #82), stock taken at once from
 * the branch warehouse, coupon / promotion uses reserved on the order. Online payment goes
 * through Payment Hub (merchant_txn_id `WEB-{tenant}-{paymentId}`, webhook + polling like POS
 * P4.5); unpaid online orders are cancelled after `paymentMinutes` (stock released).
 */

export interface StoreCartItem {
  productId: number;
  variantId?: number | null;
  quantity: number;
}

interface QuoteArgs {
  items: StoreCartItem[];
  couponCode?: string | null;
  customerId: number | null;
  /** guest placing an order: CRM customer of the phone, for per-customer flash limits (#161) */
  limitsCustomerId?: number | null;
}

/** Price a cart for the website (member discount only for a logged-in customer) */
export async function storeQuote(ch: StoreChannel, args: QuoteArgs) {
  const items = args.items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    quantity: i.quantity,
    discountPercent: 0,
  }));
  const input = {
    items,
    customerId: args.customerId,
    limitsCustomerId: args.limitsCustomerId ?? null,
    couponCode: args.couponCode || undefined,
  };
  let quote = await quoteCart(input, undefined, "website", { fee: ch.config.shippingFee });
  const fee = shippingFeeFor(ch.config, quote.totals.total);
  if (fee !== ch.config.shippingFee) quote = await quoteCart(input, undefined, "website", { fee });

  const t = quote.totals;
  const stock = await stockForLines(ch, t.lines);
  const lines = t.lines.map((l, i) => ({
    productId: l.productId,
    variantId: l.variantId,
    slug: productSlug(l.productId, l.name),
    name: l.name,
    sku: l.sku,
    unit: l.unit,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    discountAmount: l.discountAmount,
    totalAmount: l.totalAmount,
    gift: l.id.startsWith("gift-"),
    promotions: (l.promotions ?? []).map((p) => p.label),
    stock: stock[i],
  }));
  // Gift lines take stock too: compare the summed demand per product / variant
  const demand = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.productId}:${l.variantId ?? 0}`;
    demand.set(k, (demand.get(k) ?? 0) + l.quantity);
  }
  const problems = lines
    .filter(
      (l) => l.stock !== null && (demand.get(`${l.productId}:${l.variantId ?? 0}`) ?? 0) > l.stock,
    )
    .map((l) => `"${l.name}" chỉ còn ${l.stock} ${l.unit}`);
  const shippingDiscount = quote.shipping.discount;
  return {
    quote,
    view: {
      lines,
      subtotal: t.subtotal,
      lineDiscount: t.lineDiscount,
      promotions: t.promotions.map((p) => ({ label: p.label, discount: p.discount })),
      memberDiscountPercent: t.memberDiscountPercent,
      memberDiscount: t.memberDiscount,
      coupon: t.coupon,
      couponError: t.couponError,
      goodsTotal: t.total,
      shippingFee: quote.shipping.fee,
      shippingDiscount,
      total: t.total + quote.shipping.fee - shippingDiscount,
      freeShippingFrom: ch.config.freeShippingFrom,
      stockProblems: [...new Set(problems)],
    },
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateStoreOrderInput {
  items: StoreCartItem[];
  couponCode?: string | null;
  contact: { name: string; phone: string; address: string; email?: string | null };
  note?: string | null;
  paymentMethod: WebsitePaymentMethod;
  returnUrl?: string | null;
  /** P6.3: utm_source of the link the buyer followed */
  source?: string | null;
}

function orderCode(): string {
  const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  return `WEB-${d}-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
}

export async function createStoreOrder(
  ch: StoreChannel,
  input: CreateStoreOrderInput,
  ctx: { customerId: number | null; idempotencyKey: string },
) {
  const scope = ctx.customerId ? `c${ctx.customerId}` : `g${input.contact.phone}`;
  return idempotent(`store:order:${currentTenantId()}:${scope}:${ctx.idempotencyKey}`, () =>
    placeOrder(ch, input, ctx.customerId),
  );
}

async function placeOrder(
  ch: StoreChannel,
  input: CreateStoreOrderInput,
  customerId: number | null,
) {
  const cfg = ch.config;
  if (!cfg.paymentMethods.includes(input.paymentMethod))
    throw bizoneError("VALIDATION_ERROR", "Phương thức thanh toán không được hỗ trợ");
  if (input.paymentMethod === "payhub") {
    if (!payhubConfig())
      throw bizoneError(
        "SERVICE_UNAVAILABLE",
        "Thanh toán online tạm thời không khả dụng, vui lòng chọn COD",
      );
    if (!input.returnUrl || !isStorefrontUrl(input.returnUrl, cfg.storefrontUrl))
      throw bizoneError("VALIDATION_ERROR", "returnUrl phải thuộc website của cửa hàng");
  }
  const guestCustomer = customerId
    ? null
    : await getPrisma().customer.findUnique({
        where: { phone: input.contact.phone },
        select: { id: true },
      });
  const { quote, view } = await storeQuote(ch, {
    items: input.items,
    couponCode: input.couponCode,
    customerId,
    limitsCustomerId: guestCustomer?.id ?? null,
  });
  if (input.couponCode && view.couponError) throw bizoneError("VALIDATION_ERROR", view.couponError);
  if (view.stockProblems.length)
    throw bizoneError("CONFLICT", `Không đủ hàng: ${view.stockProblems.join("; ")}`, {
      stockProblems: view.stockProblems,
    });
  const warehouseId = await branchWarehouseId(cfg.branchId);
  if (!warehouseId)
    throw bizoneError("SERVICE_UNAVAILABLE", "Cửa hàng chưa sẵn sàng bán online (chưa có kho)");

  const prisma = getPrisma();
  const t = quote.totals;
  const now = new Date();
  const dueAt =
    input.paymentMethod === "payhub" ? new Date(now.getTime() + cfg.paymentMinutes * 60_000) : null;

  const order = await prisma.$transaction(
    async (tx) => {
      // Buyer: the logged-in customer, else the CRM customer of this phone (created if new)
      let buyerId = customerId;
      if (!buyerId) {
        const existing = await tx.customer.findUnique({
          where: { phone: input.contact.phone },
          select: { id: true },
        });
        buyerId =
          existing?.id ??
          (
            await tx.customer.create({
              data: {
                code: generateCustomerCode(),
                fullName: input.contact.name,
                phone: input.contact.phone,
                email: input.contact.email || null,
                notes: "Khách đặt hàng trên website",
              },
              select: { id: true },
            })
          ).id;
      }
      let code = orderCode();
      if (await tx.order.findUnique({ where: { orderCode: code }, select: { id: true } }))
        code = orderCode();

      const lines = t.lines;
      const subtotal = lines.reduce((s, l) => s + l.totalAmount, 0);
      const created = await tx.order.create({
        data: {
          orderCode: code,
          customerId: buyerId,
          contactName: input.contact.name,
          contactPhone: input.contact.phone,
          channel: WEBSITE_CHANNEL,
          channelOrderId: code,
          source: normalizeOrderSource(input.source),
          branchId: cfg.branchId,
          subtotal,
          shippingFee: view.shippingFee,
          discountAmount: subtotal - t.total + view.shippingDiscount,
          totalAmount: view.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: "unpaid",
          paymentDueAt: dueAt,
          status: "pending",
          shippingAddress: input.contact.address,
          notes: input.note || null,
          orderItems: {
            create: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              totalAmount: l.totalAmount,
            })),
          },
          orderTracking: {
            create: {
              status: "pending",
              note:
                input.paymentMethod === "payhub"
                  ? `Đặt hàng trên website — chờ thanh toán online trước ${dueAt!.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`
                  : "Đặt hàng trên website — thanh toán khi nhận hàng",
            },
          },
          orderChannelMapping: {
            create: {
              channelId: ch.id,
              channelOrderId: code,
              channelOrderData: JSON.stringify({
                coupon: t.coupon?.code ?? null,
                lines: lines.length,
              }),
            },
          },
        },
        include: { orderItems: { include: { product: { select: { name: true } } } } },
      });
      const moved = await takeOrderStock(tx, created, warehouseId, null);
      await recordCouponUse(tx, quote, { orderId: created.id });
      await recordPromotionUses(tx, quote.promotionUses, { orderId: created.id }, buyerId);
      return { ...created, moved };
    },
    { timeout: 15_000 },
  );

  // QA-5 #163: the order is committed — a failure from here on must not fail the request, or
  // the Idempotency-Key is released and the storefront's retry places a second order
  if (order.moved.length)
    await afterCommit("low-stock check", () =>
      enqueueStockChanged({
        warehouseId,
        productIds: order.moved,
        reason: "order",
        orderId: order.id,
      }),
    );
  const src = normalizeOrderSource(input.source);
  const channelName = src ? `Website (${ORDER_SOURCE_LABEL[src]})` : "Website";
  await afterCommit("sync log", () =>
    logSync({
      channelId: ch.id,
      syncType: "order",
      direction: "pull",
      status: "success",
      message: `Nhận đơn ${order.orderCode} (${fmtVnd(String(view.total))})`,
      details: {
        orderId: order.id,
        items: order.orderItems.length,
        paymentMethod: input.paymentMethod,
        ...(src ? { source: src } : {}),
      },
    }),
  );
  await notify({
    type: "order_new",
    title: `Đơn hàng ${order.orderCode} từ ${channelName} - ${fmtVnd(String(view.total))}`,
    content: `Khách ${input.contact.name} (${input.contact.phone})`,
    link: `/orders/${order.id}`,
    branchId: cfg.branchId,
    dedupeKey: `order:${order.id}`,
    vars: {
      order_code: order.orderCode,
      channel: channelName,
      customer_name: input.contact.name,
      total_amount: fmtVnd(String(view.total)),
      branch_name: "",
    },
  });

  let payment: Awaited<ReturnType<typeof startPayment>> | null = null;
  let paymentError: string | null = null;
  if (input.paymentMethod === "payhub") {
    try {
      payment = await startPayment(order.id, input.returnUrl!);
    } catch (e) {
      // The order stays: the customer can retry from the order page until the deadline
      paymentError = errorMessage(e);
    }
  }
  return {
    order: await orderView(order.id),
    payment: payment ? { paymentUrl: payment.paymentUrl, txnCode: payment.txnCode } : null,
    paymentError,
  };
}

/** Best-effort step after the order is committed: logged, never thrown */
async function afterCommit(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[store] order placed, ${label} failed:`, errorMessage(e));
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    try {
      return (JSON.parse(e.message) as { message?: string }).message ?? e.message;
    } catch {
      return e.message;
    }
  }
  return String(e);
}

// ─── Payment ─────────────────────────────────────────────────────────────────

const RECHECK_MS = 3_000;

/** Payment link for an unpaid online order: the open one, or a new Payment Hub transaction */
export async function startPayment(orderId: number, returnUrl: string) {
  const cfg = payhubConfig();
  if (!cfg) throw bizoneError("SERVICE_UNAVAILABLE", "Thanh toán online tạm thời không khả dụng");
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { orderBy: { id: "desc" }, take: 1 } },
  });
  if (order.paymentMethod !== "payhub")
    throw bizoneError("CONFLICT", "Đơn hàng thanh toán khi nhận hàng");
  if (order.paymentStatus === "paid") throw bizoneError("CONFLICT", "Đơn hàng đã được thanh toán");
  if (order.status !== "pending")
    throw bizoneError("CONFLICT", "Đơn hàng không còn chờ thanh toán");
  if (order.paymentDueAt && order.paymentDueAt <= new Date())
    throw bizoneError("CONFLICT", "Đã quá hạn thanh toán, đơn hàng sẽ được huỷ");

  const last = order.payments[0];
  if (
    last?.status === "pending" &&
    last.paymentUrl &&
    (!last.expiresAt || last.expiresAt > new Date())
  )
    return { paymentUrl: last.paymentUrl, txnCode: last.payhubTxnCode, paymentId: last.id };

  const tenantId = currentTenantId();
  const minutesLeft = order.paymentDueAt
    ? Math.max(5, Math.floor((order.paymentDueAt.getTime() - Date.now()) / 60_000))
    : 15;
  const row = await prisma.orderPayment.create({
    data: {
      orderId,
      amount: order.totalAmount,
      merchantTxnId: `WEB-${tenantId}-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  const merchantTxnId = webTxnIdOf(tenantId, row.id);
  await prisma.orderPayment.update({ where: { id: row.id }, data: { merchantTxnId } });
  const back = new URL(returnUrl);
  back.searchParams.set("order", order.orderCode);
  try {
    const res = await createPayhubTransaction(cfg, {
      merchantTxnId,
      amount: Math.round(Number(order.totalAmount)),
      description: `Thanh toan don ${order.orderCode}`,
      paymentMethod: null,
      expiryMinutes: Math.min(minutesLeft, 1440),
      returnUrl: back.toString(),
      customerName: order.contactName,
      customerPhone: order.contactPhone,
      metadata: { source: "bizone-website", tenant: tenantId, orderCode: order.orderCode },
    });
    if (!res.payment_url)
      throw new PaymentHubError("Payment Hub không trả trang thanh toán", 502, "NO_URL");
    await prisma.orderPayment.update({
      where: { id: row.id },
      data: {
        payhubTxnCode: res.txn_code,
        payhubMethod: res.payment_method,
        paymentUrl: res.payment_url,
        expiresAt: res.expired_at ? new Date(res.expired_at) : null,
      },
    });
    return { paymentUrl: res.payment_url, txnCode: res.txn_code, paymentId: row.id };
  } catch (e) {
    const msg = errorMessage(e);
    await prisma.orderPayment.update({
      where: { id: row.id },
      data: { status: "failed", failureReason: msg.slice(0, 500) },
    });
    const unavailable = e instanceof PaymentHubError && (e.status === 0 || e.status >= 500);
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      unavailable
        ? "Cổng thanh toán đang bận, vui lòng thử lại sau ít phút"
        : `Không tạo được thanh toán: ${msg}`,
    );
  }
}

interface PayhubOutcome {
  status: string;
  amount: number;
  partnerTxnId?: string | null;
  paidAt?: string | null;
  failureReason?: string | null;
}

/** Apply Payment Hub's view of a payment (webhook and polling share it; idempotent) */
export async function applyOrderPayment(p: OrderPayment, o: PayhubOutcome) {
  const prisma = getPrisma();
  const now = new Date();
  if (o.status === "Success") {
    if (Math.round(o.amount) !== Math.round(Number(p.amount))) {
      await prisma.orderPayment.update({
        where: { id: p.id },
        data: { failureReason: `Số tiền Payment Hub (${o.amount}) không khớp`, lastCheckedAt: now },
      });
      await reportSyncFailure({
        channelId: await websiteChannelId(),
        syncType: "payment",
        direction: "pull",
        message: `Thanh toán ${p.payhubTxnCode ?? p.merchantTxnId} lệch số tiền (${o.amount} ≠ ${Number(p.amount)})`,
        details: { orderId: p.orderId, paymentId: p.id },
        link: `/orders/${p.orderId}`,
        dedupeKey: `omni:pay-mismatch:${p.id}`,
      });
      return;
    }
    const changed = await prisma.orderPayment.updateMany({
      where: { id: p.id, status: { not: "success" } },
      data: {
        status: "success",
        paidAt: o.paidAt ? new Date(o.paidAt) : now,
        partnerTxnId: o.partnerTxnId ?? null,
        failureReason: null,
        lastCheckedAt: now,
      },
    });
    if (changed.count === 0) return;
    const marked = await prisma.order.updateMany({
      where: { id: p.orderId, status: { not: "cancelled" }, paymentStatus: { not: "paid" } },
      data: { paymentStatus: "paid", paymentDueAt: null },
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } });
    if (marked.count > 0) {
      await prisma.orderTracking.create({
        data: {
          orderId: p.orderId,
          status: order.status,
          note: `Đã thanh toán online ${fmtVnd(String(o.amount))} (Payment Hub ${p.payhubTxnCode ?? ""})`,
        },
      });
      await logSync({
        channelId: await websiteChannelId(),
        syncType: "payment",
        direction: "pull",
        status: "success",
        message: `Đơn ${order.orderCode} đã thanh toán online`,
        details: { orderId: order.id, txnCode: p.payhubTxnCode },
      });
    } else {
      // Paid after the order was cancelled / with another payment: money to give back (#87)
      await reportSyncFailure({
        channelId: await websiteChannelId(),
        syncType: "payment",
        direction: "pull",
        message:
          order.status === "cancelled"
            ? `Khách đã thanh toán đơn ${order.orderCode} đã huỷ — cần hoàn tiền`
            : `Đơn ${order.orderCode} được thanh toán hai lần — cần hoàn tiền một giao dịch`,
        details: { orderId: order.id, txnCode: p.payhubTxnCode, amount: o.amount },
        link: `/orders/${order.id}`,
        branchId: order.branchId,
        dedupeKey: `omni:paid-extra:${p.id}`,
      });
    }
    return;
  }
  if (o.status === "Failed" || o.status === "Expired") {
    await prisma.orderPayment.updateMany({
      where: { id: p.id, status: "pending" },
      data: {
        status: o.status === "Failed" ? "failed" : "expired",
        failureReason: o.failureReason?.slice(0, 500) ?? null,
        lastCheckedAt: now,
      },
    });
    return;
  }
  await prisma.orderPayment.update({ where: { id: p.id }, data: { lastCheckedAt: now } });
}

async function websiteChannelId() {
  const ch = await getPrisma().channelConnection.findFirst({
    where: { channelCode: WEBSITE_CHANNEL },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return ch?.id ?? null;
}

/** Ask Payment Hub about the open payments of an order (fallback when no webhook arrived) */
export async function refreshPayments(orderId: number, force = false) {
  const cfg = payhubConfig();
  if (!cfg) return;
  const open = await getPrisma().orderPayment.findMany({
    where: {
      orderId,
      status: { in: ["pending", "failed", "expired"] },
      payhubTxnCode: { not: null },
    },
    orderBy: { id: "desc" },
    take: 3,
  });
  for (const p of open) {
    const stale = !p.lastCheckedAt || Date.now() - p.lastCheckedAt.getTime() > RECHECK_MS;
    if (!force && !stale) continue;
    if (p.status !== "pending" && !force) continue;
    try {
      const t = await getPayhubTransaction(cfg, p.merchantTxnId);
      await applyOrderPayment(p, {
        status: t.status,
        amount: Number(t.amount),
        partnerTxnId: t.partnerTxnId,
        paidAt: t.paidAt,
      });
    } catch (e) {
      console.warn(`[omni] payment check ${p.merchantTxnId} failed:`, errorMessage(e));
    }
  }
}

/** Webhook from Payment Hub for a website payment (already authenticated, tenant scope set) */
export async function applyOrderWebhook(payload: {
  event?: string;
  transaction_id?: string;
  merchant_txn_id?: string | null;
  amount?: number;
  status?: string;
  partner_txn_id?: string | null;
  paid_at?: string | null;
  failure_reason?: string | null;
}) {
  const ref = parseWebTxnId(payload.merchant_txn_id);
  if (!ref) return { applied: false, reason: "not a website payment" };
  const p = await getPrisma().orderPayment.findUnique({ where: { id: ref.paymentId } });
  if (!p || p.merchantTxnId !== payload.merchant_txn_id)
    return { applied: false, reason: "unknown payment" };
  if (p.payhubTxnCode && payload.transaction_id && payload.transaction_id !== p.payhubTxnCode)
    return { applied: false, reason: "transaction mismatch" };
  const status =
    payload.event === "payment.success"
      ? "Success"
      : payload.event === "payment.failed"
        ? "Failed"
        : payload.event === "payment.expired"
          ? "Expired"
          : (payload.status ?? "");
  await applyOrderPayment(p, {
    status,
    amount: Number(payload.amount ?? 0),
    partnerTxnId: payload.partner_txn_id,
    paidAt: payload.paid_at,
    failureReason: payload.failure_reason,
  });
  const fresh = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
  return { applied: true, status: fresh.status };
}

// ─── Read / cancel ───────────────────────────────────────────────────────────

/** Customer-facing order (no internal ids beyond what the storefront needs) */
export async function orderView(id: number) {
  const o = await getPrisma().order.findUniqueOrThrow({
    where: { id },
    include: {
      orderItems: {
        include: {
          product: { select: { name: true, unit: true, image: true } },
          variant: { select: { sku: true } },
        },
      },
      orderTracking: {
        orderBy: { id: "asc" },
        select: { status: true, note: true, createdAt: true },
      },
      payments: { orderBy: { id: "desc" }, take: 1 },
      customer: { select: { phone: true } },
    },
  });
  const pay = o.payments[0];
  return {
    code: o.orderCode,
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status] ?? o.status,
    createdAt: o.createdAt.toISOString(),
    contact: { name: o.contactName, phone: o.contactPhone, address: o.shippingAddress },
    note: o.notes,
    items: o.orderItems.map((i) => ({
      productId: i.productId,
      slug: productSlug(i.productId, i.product.name),
      name: i.product.name,
      variant: i.variant?.sku ?? null,
      image: i.product.image,
      unit: i.product.unit,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount),
      totalAmount: Number(i.totalAmount),
    })),
    subtotal: Number(o.subtotal),
    shippingFee: Number(o.shippingFee),
    discountAmount: Number(o.discountAmount),
    totalAmount: Number(o.totalAmount),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    paymentDueAt: o.paymentDueAt?.toISOString() ?? null,
    payment: pay
      ? {
          status: pay.status,
          txnCode: pay.payhubTxnCode,
          paymentUrl: pay.status === "pending" ? pay.paymentUrl : null,
          paidAt: pay.paidAt?.toISOString() ?? null,
        }
      : null,
    shippingProvider: o.shippingProvider,
    trackingCode: o.trackingCode,
    canCancel: o.status === "pending" && o.paymentStatus !== "paid",
    canPay:
      o.status === "pending" &&
      o.paymentMethod === "payhub" &&
      o.paymentStatus !== "paid" &&
      (!o.paymentDueAt || o.paymentDueAt > new Date()),
    tracking: o.orderTracking.map((t) => ({
      status: t.status,
      label: ORDER_STATUS_LABEL[t.status] ?? t.status,
      note: t.note,
      at: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Find a website order the caller may see: the logged-in buyer, or a guest who gives the
 * phone number of the order (receiver or buyer).
 */
export async function findStoreOrder(
  code: string,
  who: { customerId: number | null; phone?: string | null },
) {
  const o = await getPrisma().order.findUnique({
    where: { orderCode: code },
    select: {
      id: true,
      channel: true,
      customerId: true,
      contactPhone: true,
      customer: { select: { phone: true } },
    },
  });
  const ok =
    o &&
    o.channel === WEBSITE_CHANNEL &&
    ((who.customerId && o.customerId === who.customerId) ||
      (who.phone && (o.contactPhone === who.phone || o.customer?.phone === who.phone)));
  if (!o || !ok) throw bizoneError("NOT_FOUND", "Không tìm thấy đơn hàng");
  return o.id;
}

export async function getStoreOrder(id: number) {
  await refreshPayments(id);
  return orderView(id);
}

export async function listStoreOrders(customerId: number, page: number, limit: number) {
  const where = { customerId, channel: WEBSITE_CHANNEL };
  const [rows, total] = await Promise.all([
    getPrisma().order.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        orderCode: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        createdAt: true,
        _count: { select: { orderItems: true } },
      },
    }),
    getPrisma().order.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      code: r.orderCode,
      status: r.status,
      statusLabel: ORDER_STATUS_LABEL[r.status] ?? r.status,
      totalAmount: Number(r.totalAmount),
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      itemCount: r._count.orderItems,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  };
}

/** Customer cancels an order the shop hasn't confirmed yet (not after paying online) */
export async function cancelStoreOrder(id: number, reason: string | null) {
  await refreshPayments(id, true);
  const o = await getPrisma().order.findUniqueOrThrow({ where: { id } });
  if (o.status !== "pending")
    throw bizoneError("CONFLICT", "Cửa hàng đã xác nhận đơn, liên hệ hotline để huỷ");
  if (o.paymentStatus === "paid")
    throw bizoneError("CONFLICT", "Đơn đã thanh toán online, liên hệ hotline để huỷ và hoàn tiền");
  await cancelOrderNow(id, `Khách huỷ trên website${reason ? `: ${reason}` : ""}`, null, {
    onlyUnpaid: true,
  });
  return orderView(id);
}

// ─── Payment deadline (worker) ───────────────────────────────────────────────

/**
 * Cancel website orders still unpaid past their payment deadline (stock released). Payment Hub
 * is asked once more first, so a payment whose webhook got lost is not cancelled by mistake.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const due = await getPrisma().order.findMany({
    where: {
      channel: WEBSITE_CHANNEL,
      status: "pending",
      paymentStatus: "unpaid",
      paymentDueAt: { lt: now },
    },
    select: { id: true, orderCode: true },
    take: 100,
    orderBy: { paymentDueAt: "asc" },
  });
  let cancelled = 0;
  for (const o of due) {
    try {
      await refreshPayments(o.id, true);
      const fresh = await getPrisma().order.findUniqueOrThrow({
        where: { id: o.id },
        select: { paymentStatus: true, status: true },
      });
      if (fresh.paymentStatus === "paid" || fresh.status !== "pending") continue;
      await cancelOrderNow(o.id, "Quá hạn thanh toán online — tự động huỷ", null, {
        onlyUnpaid: true,
      });
      cancelled++;
    } catch (e) {
      // paid / handled meanwhile (#152): nothing to cancel
      if (e instanceof TRPCError && e.code === "CONFLICT") continue;
      console.error(`[omni] expire ${o.orderCode} failed:`, errorMessage(e));
    }
  }
  return { checked: due.length, cancelled };
}
