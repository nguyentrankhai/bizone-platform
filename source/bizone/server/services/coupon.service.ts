import { randomInt } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CouponUsageInput,
  CreateCouponInput,
  IssueVouchersInput,
  ListCouponsInput,
  ListVouchersInput,
  UpdateCouponInput,
} from "@/lib/validators/marketing";
import { CATEGORIES_CONDITION, RANKINGS_CONDITION } from "@/server/services/pricing.service";

const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);
const num = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);

const AUTO_APPLY = "auto_apply";

export type CouponStatus = "running" | "scheduled" | "expired" | "inactive" | "exhausted";

export function couponStatus(
  c: {
    isActive: boolean;
    startDate: Date | null;
    endDate: Date | null;
    usageLimit: number | null;
    usedCount: number;
  },
  now = new Date(),
): CouponStatus {
  if (!c.isActive) return "inactive";
  if (c.endDate && c.endDate < now) return "expired";
  if (c.startDate && c.startDate > now) return "scheduled";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "exhausted";
  return "running";
}

function statusWhere(status: ListCouponsInput["status"], now: Date): Prisma.CouponWhereInput {
  switch (status) {
    case "inactive":
      return { isActive: false };
    case "expired":
      return { isActive: true, endDate: { lt: now } };
    case "scheduled":
      return { isActive: true, startDate: { gt: now } };
    case "running":
      return {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      };
    default:
      return {};
  }
}

const listOf = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function present(
  c: Prisma.CouponGetPayload<{ include: { couponConditions: true } }>,
  now = new Date(),
) {
  const cond = (t: string) => c.couponConditions.find((x) => x.conditionType === t)?.conditionValue;
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    value: Number(c.value),
    minOrderAmount: num(c.minOrderAmount),
    maxDiscount: num(c.maxDiscount),
    usageLimit: c.usageLimit,
    usagePerCustomer: c.usagePerCustomer,
    usedCount: c.usedCount,
    startDate: c.startDate,
    endDate: c.endDate,
    channels: listOf(c.applicableChannels ?? undefined),
    isActive: c.isActive,
    autoApply: cond(AUTO_APPLY) === "true",
    rankings: listOf(cond(RANKINGS_CONDITION)),
    categoryIds: listOf(cond(CATEGORIES_CONDITION)).map(Number),
    status: couponStatus(c, now),
    createdAt: c.createdAt,
  };
}

function conditionRows(input: CreateCouponInput) {
  return [
    ...(input.autoApply ? [{ conditionType: AUTO_APPLY, conditionValue: "true" }] : []),
    ...(input.rankings.length
      ? [{ conditionType: RANKINGS_CONDITION, conditionValue: input.rankings.join(",") }]
      : []),
    ...(input.categoryIds.length
      ? [{ conditionType: CATEGORIES_CONDITION, conditionValue: input.categoryIds.join(",") }]
      : []),
  ];
}

function couponData(input: CreateCouponInput) {
  return {
    code: input.code,
    name: input.name,
    type: input.type,
    value: input.type === "free_shipping" ? 0 : input.value,
    minOrderAmount: input.minOrderAmount ?? null,
    maxDiscount: input.type === "percent" ? (input.maxDiscount ?? null) : null,
    usageLimit: input.usageLimit ?? null,
    usagePerCustomer: input.usagePerCustomer ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    applicableChannels: input.channels.length ? input.channels.join(",") : null,
    isActive: input.isActive,
  };
}

async function assertCodeFree(code: string, exceptCouponId?: number) {
  const prisma = getPrisma();
  const [coupon, voucher] = await Promise.all([
    prisma.coupon.findUnique({ where: { code }, select: { id: true } }),
    prisma.voucher.findUnique({ where: { code }, select: { id: true } }),
  ]);
  if ((coupon && coupon.id !== exceptCouponId) || voucher)
    throw conflict(`Mã "${code}" đã tồn tại`);
}

async function assertCategories(ids: number[]) {
  if (!ids.length) return;
  const found = await getPrisma().productCategory.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw notFound("Có danh mục không tồn tại");
}

// ─── Coupons ────────────────────────────────────────────────────────────────

export async function listCoupons(input: ListCouponsInput) {
  const prisma = getPrisma();
  const now = new Date();
  const where: Prisma.CouponWhereInput = {
    ...statusWhere(input.status, now),
    ...(input.type ? { type: input.type } : {}),
    ...(input.search
      ? { OR: [{ code: { contains: input.search } }, { name: { contains: input.search } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { couponConditions: true, _count: { select: { vouchers: true } } },
    }),
    prisma.coupon.count({ where }),
  ]);
  const sums = await prisma.couponUsage.groupBy({
    by: ["couponId"],
    where: { couponId: { in: rows.map((r) => r.id) } },
    _sum: { discountAmount: true },
  });
  const discount = new Map(sums.map((s) => [s.couponId, Number(s._sum.discountAmount ?? 0)]));
  return {
    items: rows.map((r) => ({
      ...present(r, now),
      voucherCount: r._count.vouchers,
      totalDiscount: discount.get(r.id) ?? 0,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function couponOptions() {
  return getPrisma().coupon.findMany({
    where: { type: { not: "free_shipping" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, type: true, value: true, isActive: true },
  });
}

export async function getCoupon(id: number) {
  const prisma = getPrisma();
  const c = await prisma.coupon.findUnique({ where: { id }, include: { couponConditions: true } });
  if (!c) throw notFound(`Mã giảm giá #${id} không tồn tại`);
  const [agg, vouchers] = await Promise.all([
    prisma.couponUsage.aggregate({
      where: { couponId: id },
      _sum: { discountAmount: true },
      _count: { _all: true },
    }),
    prisma.voucher.groupBy({ by: ["status"], where: { couponId: id }, _count: { _all: true } }),
  ]);
  return {
    ...present(c),
    stats: {
      uses: agg._count._all,
      totalDiscount: Number(agg._sum.discountAmount ?? 0),
      vouchers: Object.fromEntries(vouchers.map((v) => [v.status, v._count._all])) as Record<
        string,
        number
      >,
    },
  };
}

export async function createCoupon(input: CreateCouponInput, userId: number | null) {
  await Promise.all([assertCodeFree(input.code), assertCategories(input.categoryIds)]);
  const c = await getPrisma().coupon.create({
    data: {
      ...couponData(input),
      createdBy: userId,
      couponConditions: { create: conditionRows(input) },
    },
    select: { id: true, code: true },
  });
  return c;
}

/** Edit a coupon. Once used, its code can no longer change (usage history / printed codes) */
export async function updateCoupon({ id, data }: UpdateCouponInput) {
  const prisma = getPrisma();
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) throw notFound(`Mã giảm giá #${id} không tồn tại`);
  if (data.code !== c.code) {
    if (c.usedCount > 0) throw conflict("Mã đã có lượt sử dụng — không đổi được mã");
    await assertCodeFree(data.code, id);
  }
  if (data.usageLimit && data.usageLimit < c.usedCount)
    throw invalid(`Giới hạn lượt dùng không được nhỏ hơn số lượt đã dùng (${c.usedCount})`);
  await assertCategories(data.categoryIds);
  return prisma.$transaction(async (tx) => {
    await tx.couponCondition.deleteMany({ where: { couponId: id } });
    return tx.coupon.update({
      where: { id },
      data: { ...couponData(data), couponConditions: { create: conditionRows(data) } },
      select: { id: true, code: true },
    });
  });
}

export async function setCouponActive(id: number, isActive: boolean) {
  const c = await getPrisma().coupon.updateMany({ where: { id }, data: { isActive } });
  if (c.count === 0) throw notFound(`Mã giảm giá #${id} không tồn tại`);
  return { id, isActive };
}

/** Delete only an unused coupon (no usage, no voucher used) — otherwise deactivate it */
export async function deleteCoupon(id: number) {
  const prisma = getPrisma();
  const c = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { couponUsage: true } } },
  });
  if (!c) throw notFound(`Mã giảm giá #${id} không tồn tại`);
  if (c._count.couponUsage > 0)
    throw conflict(`Mã ${c.code} đã được sử dụng — chỉ có thể ngừng áp dụng`);
  await prisma.$transaction([
    prisma.voucher.deleteMany({ where: { couponId: id } }),
    prisma.coupon.delete({ where: { id } }),
  ]);
  return { id };
}

export async function couponUsageHistory(input: CouponUsageInput) {
  const prisma = getPrisma();
  const where = { couponId: input.couponId };
  const [rows, total] = await Promise.all([
    prisma.couponUsage.findMany({
      where,
      orderBy: { usedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        invoice: { select: { id: true, invoiceCode: true, totalAmount: true, status: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
        voucher: { select: { code: true } },
      },
    }),
    prisma.couponUsage.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      usedAt: r.usedAt,
      discount: Number(r.discountAmount),
      voucherCode: r.voucher?.code ?? null,
      invoice: r.invoice
        ? {
            id: r.invoice.id,
            code: r.invoice.invoiceCode,
            total: Number(r.invoice.totalAmount),
            status: r.invoice.status,
          }
        : null,
      customer: r.customer,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

// ─── Vouchers ───────────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function voucherCode(prefix: string): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return prefix ? `${prefix}-${s}` : s;
}

/**
 * Issue personal vouchers from a coupon template: one per listed customer, per active customer
 * of the chosen rankings (loyal customers), and/or `count` unbound vouchers. Codes are random
 * (8 chars, no look-alike letters) and unique across coupons and vouchers.
 */
export async function issueVouchers(input: IssueVouchersInput) {
  const prisma = getPrisma();
  const coupon = await prisma.coupon.findUnique({ where: { id: input.couponId } });
  if (!coupon) throw notFound(`Mã giảm giá #${input.couponId} không tồn tại`);
  if (coupon.type === "free_shipping")
    throw invalid("Voucher miễn phí vận chuyển chưa dùng được tại POS");
  if (input.expiredAt && input.expiredAt <= new Date())
    throw invalid("Hạn voucher phải ở tương lai");

  const byRanking = input.rankings.length
    ? await prisma.customer.findMany({
        where: { isActive: true, ranking: { in: input.rankings } },
        select: { id: true },
        take: 2000,
      })
    : [];
  const customerIds = [...new Set([...input.customerIds, ...byRanking.map((c) => c.id)])];
  if (input.customerIds.length) {
    const found = await prisma.customer.count({
      where: { id: { in: input.customerIds }, isActive: true },
    });
    if (found !== new Set(input.customerIds).size)
      throw notFound("Có khách hàng không tồn tại hoặc đã ngừng");
  }
  const owners: (number | null)[] = [
    ...customerIds,
    ...Array.from({ length: input.count }, () => null),
  ];
  if (owners.length === 0) throw invalid("Không có khách hàng nào thuộc hạng đã chọn");
  if (owners.length > 2000) throw invalid("Tối đa 2.000 voucher mỗi lần phát hành");

  const rows = owners.map((customerId) => ({
    couponId: coupon.id,
    customerId,
    code: voucherCode(input.prefix),
    expiredAt: input.expiredAt ?? coupon.endDate ?? null,
  }));
  // Random codes rarely collide; regenerate the clashing ones (with coupon codes too)
  for (let attempt = 0; attempt < 5; attempt++) {
    const codes = rows.map((r) => r.code);
    const [v, c] = await Promise.all([
      prisma.voucher.findMany({ where: { code: { in: codes } }, select: { code: true } }),
      prisma.coupon.findMany({ where: { code: { in: codes } }, select: { code: true } }),
    ]);
    const taken = new Set([...v, ...c].map((x) => x.code));
    const seen = new Set<string>();
    let clash = false;
    for (const r of rows) {
      if (taken.has(r.code) || seen.has(r.code)) {
        r.code = voucherCode(input.prefix);
        clash = true;
      }
      seen.add(r.code);
    }
    if (!clash) break;
  }
  const res = await prisma.voucher.createMany({ data: rows });
  return { couponId: coupon.id, issued: res.count, sample: rows.slice(0, 5).map((r) => r.code) };
}

export async function listVouchers(input: ListVouchersInput) {
  const prisma = getPrisma();
  const now = new Date();
  // Lazily mark expired vouchers so filters and the POS agree
  await prisma.voucher.updateMany({
    where: { status: "active", expiredAt: { lt: now } },
    data: { status: "expired" },
  });
  const where: Prisma.VoucherWhereInput = {
    ...(input.couponId ? { couponId: input.couponId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { code: { contains: input.search } },
            { customer: { fullName: { contains: input.search } } },
            { customer: { phone: { contains: input.search } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        coupon: { select: { id: true, code: true, name: true, type: true, value: true } },
        customer: { select: { id: true, fullName: true, phone: true, ranking: true } },
      },
    }),
    prisma.voucher.count({ where }),
  ]);
  return {
    items: rows.map((v) => ({
      id: v.id,
      code: v.code,
      status: v.status,
      issuedAt: v.issuedAt,
      usedAt: v.usedAt,
      expiredAt: v.expiredAt,
      coupon: v.coupon ? { ...v.coupon, value: Number(v.coupon.value) } : null,
      customer: v.customer,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function cancelVoucher(id: number) {
  const res = await getPrisma().voucher.updateMany({
    where: { id, status: "active" },
    data: { status: "cancelled" },
  });
  if (res.count === 0) throw conflict("Chỉ huỷ được voucher còn hiệu lực");
  return { id, status: "cancelled" as const };
}
