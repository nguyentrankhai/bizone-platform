import { getPrisma } from "@/lib/prisma";
import type {
  ListCustomersInput,
  CreateCustomerInput,
  UpdateCustomerInput,
  AdjustPointsInput,
  CreateDebtInput,
  PayDebtInput,
  MergeCustomersInput,
} from "@/lib/validators/customer";

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

function generateCustomerCode(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `KH-${date}-${rand}`;
}

// ─── Ranking thresholds ────────────────────────────────────────────────────────
function computeRanking(totalSpent: number): "silver" | "gold" | "vip" | "diamond" {
  if (totalSpent >= 50_000_000) return "diamond";
  if (totalSpent >= 20_000_000) return "vip";
  if (totalSpent >= 5_000_000) return "gold";
  return "silver";
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function listCustomers(input: ListCustomersInput) {
  const prisma = getPrisma();
  const { page, limit, search, groupId, ranking, isActive } = input;
  const skip = (page - 1) * limit;

  const where = {
    ...(search && {
      OR: [
        { fullName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { code: { contains: search } },
      ],
    }),
    ...(groupId && { groupId }),
    ...(ranking && { ranking }),
    ...(isActive !== undefined && { isActive }),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { invoices: true, orders: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get ───────────────────────────────────────────────────────────────────────

export async function getCustomer(id: number) {
  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      group: true,
      customerAddresses: true,
      customerLoyaltyPoints: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { createdByUser: { select: { id: true, username: true } } },
      },
      customerDebts: {
        orderBy: { createdAt: "desc" },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          invoiceCode: true,
          totalAmount: true,
          status: true,
          createdAt: true,
        },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!customer) throw notFound(`Khách hàng #${id} không tồn tại`);
  return customer;
}

// ─── Search by phone (real-time) ───────────────────────────────────────────────

export async function searchByPhone(phone: string) {
  const prisma = getPrisma();
  return prisma.customer.findMany({
    where: { phone: { contains: phone }, isActive: true },
    take: 10,
    select: { id: true, code: true, fullName: true, phone: true, ranking: true, totalPoints: true },
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCustomer(input: CreateCustomerInput, userId: number | null) {
  const prisma = getPrisma();

  const existing = await prisma.customer.findUnique({ where: { phone: input.phone } });
  if (existing) throw conflict(`SĐT ${input.phone} đã tồn tại`);

  let code = generateCustomerCode();
  const dup = await prisma.customer.findUnique({ where: { code } });
  if (dup) code = generateCustomerCode();

  const customer = await prisma.customer.create({
    data: {
      code,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      gender: input.gender ?? null,
      birthday: input.birthday ? new Date(input.birthday) : null,
      groupId: input.groupId ?? null,
      debtLimit: input.debtLimit,
      notes: input.notes ?? null,
      createdBy: userId,
      ...(input.address && {
        customerAddresses: {
          create: { address: input.address, isDefault: true },
        },
      }),
    },
    include: { customerAddresses: true },
  });

  return customer;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCustomer(id: number, input: UpdateCustomerInput) {
  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw notFound(`Khách hàng #${id} không tồn tại`);

  if (input.phone && input.phone !== customer.phone) {
    const dup = await prisma.customer.findUnique({ where: { phone: input.phone } });
    if (dup) throw conflict(`SĐT ${input.phone} đã tồn tại`);
  }

  return prisma.customer.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.birthday !== undefined && {
        birthday: input.birthday ? new Date(input.birthday) : null,
      }),
      ...(input.groupId !== undefined && { groupId: input.groupId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.debtLimit !== undefined && { debtLimit: input.debtLimit }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

// ─── Loyalty points ────────────────────────────────────────────────────────────

export async function adjustLoyaltyPoints(
  customerId: number,
  input: AdjustPointsInput,
  userId: number | null,
) {
  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw notFound(`Khách hàng #${customerId} không tồn tại`);

  if (input.type === "redeem" && customer.totalPoints < Math.abs(input.points)) {
    throw conflict(`Không đủ điểm. Hiện có ${customer.totalPoints}, cần ${Math.abs(input.points)}`);
  }

  const delta = input.type === "redeem" ? -Math.abs(input.points) : Math.abs(input.points);

  await prisma.$transaction([
    prisma.customerLoyaltyPoint.create({
      data: {
        customerId,
        points: delta,
        type: input.type,
        notes: input.notes ?? null,
        createdBy: userId,
      },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: { totalPoints: { increment: delta } },
    }),
  ]);

  return { success: true, newTotal: customer.totalPoints + delta };
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export async function createDebt(customerId: number, input: CreateDebtInput) {
  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw notFound(`Khách hàng #${customerId} không tồn tại`);

  return prisma.customerDebt.create({
    data: {
      customerId,
      invoiceId: input.invoiceId ?? null,
      totalAmount: input.totalAmount,
      remainingAmount: input.totalAmount,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes ?? null,
      status: "pending",
    },
  });
}

export async function payDebt(customerId: number, input: PayDebtInput, _userId: number | null) {
  const prisma = getPrisma();
  const debt = await prisma.customerDebt.findUnique({ where: { id: input.debtId } });
  if (!debt || debt.customerId !== customerId)
    throw notFound(`Công nợ #${input.debtId} không tồn tại`);
  if (debt.status === "paid") throw conflict("Công nợ đã được thanh toán đủ");

  const remaining = Number(debt.remainingAmount) - input.amount;
  const newStatus = remaining <= 0 ? "paid" : input.amount > 0 ? "partial" : debt.status;

  return prisma.customerDebt.update({
    where: { id: input.debtId },
    data: {
      paidAmount: { increment: input.amount },
      remainingAmount: Math.max(0, remaining),
      status: newStatus,
      notes: input.notes ?? debt.notes,
    },
  });
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export async function mergeCustomers(input: MergeCustomersInput) {
  const prisma = getPrisma();
  const [keep, merge] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.keepId } }),
    prisma.customer.findUnique({ where: { id: input.mergeId } }),
  ]);
  if (!keep) throw notFound(`Khách hàng #${input.keepId} không tồn tại`);
  if (!merge) throw notFound(`Khách hàng #${input.mergeId} không tồn tại`);
  if (input.keepId === input.mergeId) throw conflict("Không thể hợp nhất khách hàng với chính nó");

  await prisma.$transaction([
    // Move invoices and orders to keep
    prisma.invoice.updateMany({
      where: { customerId: input.mergeId },
      data: { customerId: input.keepId },
    }),
    prisma.order.updateMany({
      where: { customerId: input.mergeId },
      data: { customerId: input.keepId },
    }),
    // Move loyalty points
    prisma.customerLoyaltyPoint.updateMany({
      where: { customerId: input.mergeId },
      data: { customerId: input.keepId },
    }),
    // Move debts
    prisma.customerDebt.updateMany({
      where: { customerId: input.mergeId },
      data: { customerId: input.keepId },
    }),
    // Update keep totals
    prisma.customer.update({
      where: { id: input.keepId },
      data: {
        totalSpent: { increment: Number(merge.totalSpent) },
        totalPoints: { increment: merge.totalPoints },
      },
    }),
    // Deactivate merged customer
    prisma.customer.update({
      where: { id: input.mergeId },
      data: { isActive: false, notes: `[Đã hợp nhất vào KH #${input.keepId}]` },
    }),
  ]);

  return { success: true };
}

// ─── Auto-upgrade ranking after spend ─────────────────────────────────────────

export async function updateSpentAndRanking(
  customerId: number,
  spentAmount: number,
  earnedPoints: number,
) {
  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;

  const newSpent = Number(customer.totalSpent) + spentAmount;
  const newRanking = computeRanking(newSpent);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalSpent: newSpent,
      totalPoints: { increment: earnedPoints },
      ranking: newRanking,
    },
  });
}

// ─── Export Excel ─────────────────────────────────────────────────────────────

export async function exportCustomersToExcel(input: ListCustomersInput) {
  const ExcelJS = await import("exceljs").then((m) => m.default);
  const { items } = await listCustomers({ ...input, limit: 5000, page: 1 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Khách hàng");

  ws.columns = [
    { header: "Mã KH", key: "code", width: 20 },
    { header: "Họ tên", key: "fullName", width: 24 },
    { header: "SĐT", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "Nhóm", key: "group", width: 16 },
    { header: "Xếp hạng", key: "ranking", width: 12 },
    { header: "Điểm", key: "totalPoints", width: 10 },
    { header: "Tổng chi tiêu", key: "totalSpent", width: 16 },
    { header: "Trạng thái", key: "isActive", width: 12 },
    { header: "Ngày tạo", key: "createdAt", width: 20 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };

  const rankLabel: Record<string, string> = {
    silver: "Silver",
    gold: "Gold",
    vip: "VIP",
    diamond: "Diamond",
  };

  for (const c of items) {
    const g = (c as { group?: { name?: string } }).group;
    ws.addRow({
      code: c.code,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email ?? "",
      group: g?.name ?? "",
      ranking: rankLabel[c.ranking] ?? c.ranking,
      totalPoints: c.totalPoints,
      totalSpent: Number(c.totalSpent),
      isActive: c.isActive ? "Hoạt động" : "Ngừng",
      createdAt: c.createdAt.toLocaleString("vi-VN"),
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
