import { getPrisma } from "@/lib/prisma";
import type {
  ListOrdersInput,
  CreateOrderInput,
  UpdateOrderStatusInput,
  CancelOrderInput,
  CreateRefundInput,
} from "@/lib/validators/order";

function conflict(msg: string): Error {
  return Object.assign(new Error(JSON.stringify({ code: "CONFLICT", message: msg })), {
    bizoneCode: "CONFLICT",
  });
}
function notFound(msg: string): Error {
  return Object.assign(new Error(JSON.stringify({ code: "NOT_FOUND", message: msg })), {
    bizoneCode: "NOT_FOUND",
  });
}

function generateOrderCode(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `ORD-${date}-${rand}`;
}

function generateRefundCode(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `REF-${date}-${rand}`;
}

// ─── List & Get ───────────────────────────────────────────────────────────────

export async function listOrders(input: ListOrdersInput) {
  const prisma = getPrisma();
  const {
    page,
    limit,
    search,
    channel,
    status,
    paymentStatus,
    dateFrom,
    dateTo,
    branchId,
    createdBy,
  } = input;
  const skip = (page - 1) * limit;

  const where = {
    ...(search && {
      OR: [
        { orderCode: { contains: search } },
        { customer: { fullName: { contains: search } } },
        { customer: { phone: { contains: search } } },
      ],
    }),
    ...(channel && { channel }),
    ...(status && { status }),
    ...(paymentStatus && { paymentStatus }),
    ...(branchId && { branchId }),
    ...(createdBy && { createdBy }),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo + "T23:59:59Z") }),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        orderItems: {
          take: 3,
          include: { product: { select: { name: true } } },
        },
        _count: { select: { orderItems: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getOrder(id: number) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      orderItems: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, sku: true } },
        },
      },
      orderTracking: { orderBy: { createdAt: "asc" } },
      orderRefunds: {
        include: {
          orderRefundItems: {
            include: { orderItem: { include: { product: { select: { name: true } } } } },
          },
        },
      },
      branch: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, username: true } },
    },
  });
  if (!order) throw notFound(`Đơn hàng #${id} không tồn tại`);
  return order;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput, userId: number | null) {
  const prisma = getPrisma();

  const subtotal = input.items.reduce((sum, item) => {
    const lineTotal = item.unitPrice * item.quantity - item.discountAmount;
    return sum + lineTotal;
  }, 0);
  const totalAmount = subtotal + input.shippingFee - input.discountAmount;

  let orderCode = generateOrderCode();
  // Retry once on collision
  const existing = await prisma.order.findUnique({ where: { orderCode } });
  if (existing) orderCode = generateOrderCode();

  const order = await prisma.order.create({
    data: {
      orderCode,
      customerId: input.customerId ?? null,
      channel: input.channel,
      channelOrderId: input.channelOrderId ?? null,
      branchId: input.branchId ?? null,
      subtotal,
      shippingFee: input.shippingFee,
      discountAmount: input.discountAmount,
      totalAmount,
      paymentMethod: input.paymentMethod ?? null,
      paymentStatus: input.paymentStatus,
      status: "pending",
      shippingAddress: input.shippingAddress ?? null,
      shippingProvider: input.shippingProvider ?? null,
      trackingCode: input.trackingCode ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
      orderItems: {
        create: input.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          totalAmount: item.unitPrice * item.quantity - item.discountAmount,
        })),
      },
      orderTracking: {
        create: {
          status: "pending",
          note: "Đơn hàng được tạo",
          createdBy: userId,
        },
      },
    },
    include: {
      orderItems: true,
      orderTracking: true,
    },
  });

  return order;
}

// ─── Update Status ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  delivered: ["completed", "returned"],
  completed: [],
  cancelled: [],
  returned: [],
};

export async function updateOrderStatus(
  id: number,
  input: UpdateOrderStatusInput,
  userId: number | null,
) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound(`Đơn hàng #${id} không tồn tại`);

  const allowed = VALID_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw conflict(
      `Không thể chuyển từ "${order.status}" sang "${input.status}". Các trạng thái cho phép: ${allowed.join(", ") || "không có"}`,
    );
  }

  const updateData: Record<string, unknown> = { status: input.status };
  if (input.trackingCode) updateData.trackingCode = input.trackingCode;
  if (input.shippingProvider) updateData.shippingProvider = input.shippingProvider;

  const [updated] = await prisma.$transaction([
    prisma.order.update({ where: { id }, data: updateData }),
    prisma.orderTracking.create({
      data: {
        orderId: id,
        status: input.status,
        note: input.note ?? null,
        createdBy: userId,
      },
    }),
  ]);

  return updated;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelOrder(id: number, input: CancelOrderInput, userId: number | null) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound(`Đơn hàng #${id} không tồn tại`);

  const cancellable = ["pending", "confirmed", "preparing"];
  if (!cancellable.includes(order.status)) {
    throw conflict(`Không thể huỷ đơn hàng ở trạng thái "${order.status}"`);
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id }, data: { status: "cancelled" } }),
    prisma.orderTracking.create({
      data: {
        orderId: id,
        status: "cancelled",
        note: input.reason,
        createdBy: userId,
      },
    }),
  ]);

  return { success: true };
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export async function createRefund(id: number, input: CreateRefundInput, userId: number | null) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id },
    include: { orderItems: true },
  });
  if (!order) throw notFound(`Đơn hàng #${id} không tồn tại`);

  if (!["completed", "delivered", "returned"].includes(order.status)) {
    throw conflict(`Chỉ hoàn trả được đơn hàng ở trạng thái hoàn thành hoặc đã giao`);
  }

  // Validate items belong to this order
  const orderItemIds = new Set(order.orderItems.map((i) => i.id));
  for (const item of input.items) {
    if (!orderItemIds.has(item.orderItemId)) {
      throw notFound(`Sản phẩm #${item.orderItemId} không thuộc đơn hàng này`);
    }
  }

  const totalRefundAmount = input.items.reduce((sum, i) => sum + i.refundAmount, 0);
  const refundCode = generateRefundCode();

  const refund = await prisma.orderRefund.create({
    data: {
      orderId: id,
      refundCode,
      reason: input.reason,
      totalRefundAmount,
      status: "completed",
      createdBy: userId,
      orderRefundItems: {
        create: input.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          refundAmount: item.refundAmount,
          reason: item.reason ?? null,
        })),
      },
    },
    include: { orderRefundItems: true },
  });

  // Track on order
  await prisma.orderTracking.create({
    data: {
      orderId: id,
      status: "returned",
      note: `Hoàn trả ${refundCode}: ${input.reason}`,
      createdBy: userId,
    },
  });

  return refund;
}

// ─── Export Excel ─────────────────────────────────────────────────────────────

export async function exportOrdersToExcel(input: ListOrdersInput) {
  const ExcelJS = await import("exceljs").then((m) => m.default);

  const { items } = await listOrders({ ...input, limit: 5000, page: 1 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Đơn hàng");

  ws.columns = [
    { header: "Mã đơn", key: "orderCode", width: 22 },
    { header: "Khách hàng", key: "customer", width: 24 },
    { header: "Kênh", key: "channel", width: 14 },
    { header: "Trạng thái", key: "status", width: 16 },
    { header: "Thanh toán", key: "paymentStatus", width: 14 },
    { header: "Tạm tính", key: "subtotal", width: 14 },
    { header: "Phí ship", key: "shippingFee", width: 12 },
    { header: "Giảm giá", key: "discountAmount", width: 12 },
    { header: "Tổng tiền", key: "totalAmount", width: 14 },
    { header: "ĐVVC", key: "shippingProvider", width: 14 },
    { header: "Mã vận đơn", key: "trackingCode", width: 20 },
    { header: "Ngày tạo", key: "createdAt", width: 20 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const statusLabel: Record<string, string> = {
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    preparing: "Đang chuẩn bị",
    shipping: "Đang giao",
    delivered: "Đã giao",
    completed: "Hoàn thành",
    cancelled: "Đã huỷ",
    returned: "Hoàn trả",
  };

  for (const order of items) {
    const customer = (order as { customer?: { fullName?: string } }).customer;
    ws.addRow({
      orderCode: order.orderCode,
      customer: customer?.fullName ?? "Khách lẻ",
      channel: order.channel ?? "",
      status: statusLabel[order.status] ?? order.status,
      paymentStatus: order.paymentStatus,
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shippingFee),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      shippingProvider: order.shippingProvider ?? "",
      trackingCode: order.trackingCode ?? "",
      createdAt: order.createdAt.toLocaleString("vi-VN"),
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
