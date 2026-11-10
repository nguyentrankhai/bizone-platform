import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { dbDate, vnDateKey } from "@/lib/vn-time";
import type { Prisma } from "@/generated/prisma/client";
import { allocatePayment, debtStatus, isOverdue, round2 } from "@/lib/supplier/calc";
import type {
  CreateSupplierInput,
  ListSuppliersInput,
  PriceComparisonInput,
  RecordPaymentInput,
  SupplierHistoryInput,
  UpdateSupplierInput,
} from "@/lib/validators/supplier";
import { PO_REFERENCE_TYPE } from "@/server/services/purchaseOrder.service";
import { RECORD_SOURCE, postAutoRecord } from "@/server/services/ledger.service";

const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);

const num = (v: Prisma.Decimal | number | bigint | null | undefined) => Number(v ?? 0);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const todayKey = () => vnDateKey(new Date());

/** "" from optional form fields → NULL in the DB */
function clean<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])) as T;
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string }).code === "P2002";
}

// ─── Debt aggregates ────────────────────────────────────────────────────────

interface DebtAgg {
  owed: number;
  overdue: number;
  openCount: number;
}

/** Remaining / overdue debt per supplier (overdue = due date before today, VN calendar) */
async function debtAggregates(supplierIds: number[]): Promise<Map<number, DebtAgg>> {
  const out = new Map<number, DebtAgg>();
  if (supplierIds.length === 0) return out;
  const rows = await getPrisma().supplierDebt.findMany({
    where: { supplierId: { in: supplierIds }, remainingAmount: { gt: 0 } },
    select: { supplierId: true, remainingAmount: true, dueDate: true },
  });
  const today = todayKey();
  for (const r of rows) {
    const agg = out.get(r.supplierId) ?? { owed: 0, overdue: 0, openCount: 0 };
    const remaining = num(r.remainingAmount);
    agg.owed = round2(agg.owed + remaining);
    agg.openCount += 1;
    if (isOverdue(dateOnly(r.dueDate), remaining, today)) {
      agg.overdue = round2(agg.overdue + remaining);
    }
    out.set(r.supplierId, agg);
  }
  return out;
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

export async function listSuppliers(input: ListSuppliersInput) {
  const prisma = getPrisma();
  let debtFilter: number[] | undefined;
  if (input.debt) {
    const owing = await prisma.supplierDebt.findMany({
      where: {
        remainingAmount: { gt: 0 },
        ...(input.debt === "overdue" ? { dueDate: { lt: dbDate(todayKey()) } } : {}),
      },
      select: { supplierId: true },
      distinct: ["supplierId"],
    });
    debtFilter = owing.map((d) => d.supplierId);
  }
  const where: Prisma.SupplierWhereInput = {
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(debtFilter ? { id: { in: debtFilter } } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search } },
            { code: { contains: input.search } },
            { phone: { contains: input.search } },
            { taxCode: { contains: input.search } },
            { contactPerson: { contains: input.search } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { _count: { select: { purchaseOrders: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);
  const debts = await debtAggregates(rows.map((r) => r.id));
  return {
    items: rows.map(({ _count, ...s }) => ({
      ...s,
      poCount: _count.purchaseOrders,
      owed: debts.get(s.id)?.owed ?? 0,
      overdue: debts.get(s.id)?.overdue ?? 0,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

/** Minimal list for selects (PO form, filters) */
export async function supplierOptions(includeInactive = false) {
  return getPrisma().supplier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, paymentTerms: true, isActive: true },
  });
}

export async function getSupplier(id: number) {
  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw notFound(`Nhà cung cấp #${id} không tồn tại`);

  const [byStatus, received, paid, lastPo, debts] = await Promise.all([
    prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { supplierId: id },
      _count: { _all: true },
    }),
    prisma.supplierDebt.aggregate({ where: { supplierId: id }, _sum: { totalAmount: true } }),
    prisma.supplierPayment.aggregate({ where: { supplierId: id }, _sum: { amount: true } }),
    prisma.purchaseOrder.findFirst({
      where: { supplierId: id, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    debtAggregates([id]),
  ]);
  const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
  return {
    ...supplier,
    stats: {
      poCount: byStatus.reduce((s, b) => s + b._count._all, 0),
      pending: counts.pending ?? 0,
      partial: counts.partial ?? 0,
      received: counts.received ?? 0,
      cancelled: counts.cancelled ?? 0,
      /** Value of goods received (what became debt) */
      purchasedAmount: num(received._sum.totalAmount),
      paidAmount: num(paid._sum.amount),
      owed: debts.get(id)?.owed ?? 0,
      overdue: debts.get(id)?.overdue ?? 0,
      lastPurchaseAt: lastPo?.createdAt ?? null,
    },
  };
}

async function nextSupplierCode(): Promise<string> {
  const rows = await getPrisma().$queryRaw<{ n: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)) AS n FROM suppliers WHERE code REGEXP '^NCC[0-9]+$'`;
  return `NCC${String(num(rows[0]?.n) + 1).padStart(4, "0")}`;
}

export async function createSupplier(input: CreateSupplierInput) {
  const prisma = getPrisma();
  const data = clean(input);
  for (let attempt = 0; ; attempt++) {
    const code = data.code ?? (await nextSupplierCode());
    try {
      return await prisma.supplier.create({ data: { ...data, code } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      if (data.code) throw conflict(`Mã nhà cung cấp "${data.code}" đã tồn tại`);
      if (attempt >= 3) throw conflict("Không sinh được mã nhà cung cấp, thử lại");
    }
  }
}

export async function updateSupplier({ id, data }: UpdateSupplierInput) {
  const prisma = getPrisma();
  const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound(`Nhà cung cấp #${id} không tồn tại`);
  try {
    return await prisma.supplier.update({ where: { id }, data: clean(data) });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`Mã nhà cung cấp "${data.code}" đã tồn tại`);
    throw e;
  }
}

/** Hard delete only while the supplier has no purchase orders / payments; else deactivate */
export async function deleteSupplier(id: number) {
  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true, supplierPayments: true } } },
  });
  if (!supplier) throw notFound(`Nhà cung cấp #${id} không tồn tại`);
  if (supplier._count.purchaseOrders > 0 || supplier._count.supplierPayments > 0) {
    throw conflict(
      `"${supplier.name}" đã có đơn nhập / thanh toán — không xoá được, hãy chuyển sang "Ngừng hợp tác"`,
    );
  }
  await prisma.supplier.delete({ where: { id } });
  return { id };
}

// ─── Debts & payments ───────────────────────────────────────────────────────

export async function listSupplierDebts(supplierId: number) {
  const prisma = getPrisma();
  const exists = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true },
  });
  if (!exists) throw notFound(`Nhà cung cấp #${supplierId} không tồn tại`);
  const [debts, payments] = await Promise.all([
    prisma.supplierDebt.findMany({
      where: { supplierId },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.supplierPayment.findMany({
      where: { supplierId },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        purchaseOrder: { select: { id: true, poCode: true } },
        createdByUser: { select: { fullName: true, username: true } },
      },
    }),
  ]);
  const poCodes = new Map(
    (
      await prisma.purchaseOrder.findMany({
        where: { id: { in: debts.map((d) => d.poId).filter((x): x is number => !!x) } },
        select: { id: true, poCode: true },
      })
    ).map((p) => [p.id, p.poCode]),
  );
  const today = todayKey();
  return {
    debts: debts.map((d) => {
      const remaining = num(d.remainingAmount);
      return {
        id: d.id,
        poId: d.poId,
        poCode: d.poId ? (poCodes.get(d.poId) ?? null) : null,
        totalAmount: num(d.totalAmount),
        paidAmount: num(d.paidAmount),
        remainingAmount: remaining,
        dueDate: dateOnly(d.dueDate),
        status: d.status,
        isOverdue: isOverdue(dateOnly(d.dueDate), remaining, today),
        createdAt: d.createdAt,
      };
    }),
    payments: payments.map((p) => ({
      id: p.id,
      poId: p.poId,
      poCode: p.purchaseOrder?.poCode ?? null,
      amount: num(p.amount),
      paymentDate: dateOnly(p.paymentDate),
      paymentMethod: p.paymentMethod,
      referenceCode: p.referenceCode,
      notes: p.notes,
      createdBy: p.createdByUser?.fullName ?? p.createdByUser?.username ?? null,
      createdAt: p.createdAt,
    })),
  };
}

/**
 * Record a payment to a supplier. With `poId` it settles that order's debt; without, it pays
 * the oldest open debts first (earliest due date, then oldest). One `supplier_payments` row is
 * written per debt touched. Never more than what is owed (no prepayment / credit balance).
 */
export async function recordSupplierPayment(
  input: RecordPaymentInput,
  userId: number | null,
  /** P4.8: branch of the payment voucher (the fund's branch, else the user's current branch) */
  branchId: number | null = null,
) {
  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) throw notFound(`Nhà cung cấp #${input.supplierId} không tồn tại`);
  const paymentDate = input.paymentDate ?? todayKey();
  if (paymentDate > todayKey()) throw invalid("Ngày thanh toán không được ở tương lai");

  return prisma.$transaction(async (trx) => {
    // One payment per supplier at a time — the allocation reads then writes several debts
    await trx.$queryRaw`SELECT id FROM suppliers WHERE id = ${supplier.id} FOR UPDATE`;
    const open = await trx.supplierDebt.findMany({
      where: {
        supplierId: supplier.id,
        remainingAmount: { gt: 0 },
        ...(input.poId ? { poId: input.poId } : {}),
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (open.length === 0) {
      throw conflict(
        input.poId
          ? "Đơn nhập này không còn công nợ (chưa nhận hàng hoặc đã trả đủ)"
          : `Không còn công nợ với "${supplier.name}"`,
      );
    }
    let allocation: { debtId: number; amount: number }[];
    try {
      allocation = allocatePayment(
        input.amount,
        open.map((d) => ({ id: d.id, remaining: num(d.remainingAmount) })),
      );
    } catch (e) {
      throw invalid(e instanceof Error ? e.message : String(e));
    }

    const byId = new Map(open.map((d) => [d.id, d]));
    const created = [];
    for (const a of allocation) {
      const debt = byId.get(a.debtId)!;
      const paid = round2(num(debt.paidAmount) + a.amount);
      const total = num(debt.totalAmount);
      const { count } = await trx.supplierDebt.updateMany({
        where: { id: debt.id, remainingAmount: { gte: a.amount } },
        data: {
          paidAmount: paid,
          remainingAmount: round2(total - paid),
          status: debtStatus(total, paid),
        },
      });
      if (count === 0) throw conflict("Công nợ vừa được cập nhật, vui lòng tải lại");
      created.push(
        await trx.supplierPayment.create({
          data: {
            supplierId: supplier.id,
            poId: debt.poId,
            amount: a.amount,
            paymentDate: dbDate(paymentDate),
            paymentMethod: input.paymentMethod,
            referenceCode: input.referenceCode || null,
            notes: input.notes || null,
            createdBy: userId,
          },
          select: { id: true, poId: true, amount: true },
        }),
      );
    }
    // P4.8: phiếu chi "Tiền nhập hàng" in the cash book (+ fund movement when a fund is given)
    const voucher = await postAutoRecord(trx, {
      type: "expense",
      categoryCode: "expense_purchase",
      fundId: input.fundId ?? null,
      branchId,
      amount: round2(input.amount),
      date: paymentDate,
      description: `Thanh toán NCC ${supplier.name}${input.referenceCode ? ` (${input.referenceCode})` : ""}`,
      partnerName: supplier.name,
      referenceType: RECORD_SOURCE.supplierPayment,
      referenceId: created[0].id,
      userId,
    });
    return {
      supplierId: supplier.id,
      amount: round2(input.amount),
      payments: created.map((p) => ({ id: p.id, poId: p.poId, amount: num(p.amount) })),
      voucher: { id: voucher.id, code: voucher.code },
    };
  });
}

// ─── History ────────────────────────────────────────────────────────────────

interface HistoryRow {
  kind: "po_created" | "receipt" | "payment" | "po_cancelled";
  at: Date;
  ref: string;
  amount: number | null;
  poId: number | null;
  poCode: string | null;
  note: string | null;
}

/**
 * Timeline of everything that happened with a supplier: orders placed, goods received
 * (inventory receipts of its POs), payments, cancellations — newest first.
 */
export async function supplierHistory(input: SupplierHistoryInput) {
  const prisma = getPrisma();
  const id = input.supplierId;
  const exists = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound(`Nhà cung cấp #${id} không tồn tại`);
  const offset = (input.page - 1) * input.pageSize;

  const rows = await prisma.$queryRaw<
    {
      kind: string;
      at: Date;
      ref: string;
      amount: unknown;
      po_id: number | null;
      po_code: string | null;
      note: string | null;
    }[]
  >`
    SELECT * FROM (
      SELECT 'po_created' AS kind, po.created_at AS at, po.po_code AS ref, po.total_amount AS amount,
             po.id AS po_id, po.po_code AS po_code, NULL AS note
        FROM purchase_orders po WHERE po.supplier_id = ${id}
      UNION ALL
      SELECT 'po_cancelled', po.updated_at, po.po_code, NULL, po.id, po.po_code, NULL
        FROM purchase_orders po WHERE po.supplier_id = ${id} AND po.status = 'cancelled'
      UNION ALL
      SELECT 'receipt', it.created_at, it.transaction_code,
             (SELECT SUM(iti.quantity * IFNULL(iti.unit_cost, 0))
                FROM inventory_transaction_items iti WHERE iti.transaction_id = it.id),
             po.id, po.po_code, it.notes
        FROM inventory_transactions it
        JOIN purchase_orders po ON po.id = it.reference_id
       WHERE it.reference_type = ${PO_REFERENCE_TYPE} AND po.supplier_id = ${id}
      UNION ALL
      SELECT 'payment', sp.created_at, IFNULL(sp.reference_code, CONCAT('TT#', sp.id)), sp.amount,
             sp.po_id, po.po_code, sp.notes
        FROM supplier_payments sp LEFT JOIN purchase_orders po ON po.id = sp.po_id
       WHERE sp.supplier_id = ${id}
    ) h
    ORDER BY at DESC, FIELD(kind, 'payment', 'po_cancelled', 'receipt', 'po_created')
    LIMIT ${input.pageSize} OFFSET ${offset}`;

  const countRows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT
      (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = ${id})
    + (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = ${id} AND status = 'cancelled')
    + (SELECT COUNT(*) FROM inventory_transactions it JOIN purchase_orders po ON po.id = it.reference_id
        WHERE it.reference_type = ${PO_REFERENCE_TYPE} AND po.supplier_id = ${id})
    + (SELECT COUNT(*) FROM supplier_payments WHERE supplier_id = ${id}) AS n`;
  const total = num(countRows[0]?.n);

  const items: HistoryRow[] = rows.map((r) => ({
    kind: r.kind as HistoryRow["kind"],
    at: new Date(r.at),
    ref: r.ref,
    amount: r.amount === null ? null : round2(Number(r.amount)),
    poId: r.po_id === null ? null : Number(r.po_id),
    poCode: r.po_code,
    note: r.note,
  }));
  return {
    items,
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

// ─── Price comparison ───────────────────────────────────────────────────────

interface PriceRow {
  product_id: number;
  variant_id: number | null;
  product_name: string;
  sku: string;
  unit: string | null;
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  last_cost: unknown;
  last_at: Date;
  min_cost: unknown;
  max_cost: unknown;
  avg_cost: unknown;
  total_qty: unknown;
  po_count: bigint | number;
}

/**
 * Purchase prices of the same product across suppliers, from POs that were not cancelled (lines
 * of a cancelled PO count only if some goods arrived). Prices are net
 * unit costs (after line discount). Per supplier: last price, min / max, quantity-weighted
 * average, quantity and number of orders. Suppliers sorted by last price; the cheapest is marked
 * and every other one shows how much more it costs (%).
 */
export async function priceComparison(input: PriceComparisonInput) {
  const prisma = getPrisma();
  const productFilter = input.productId ?? null;
  const supplierFilter = input.supplierId ?? null;
  const search = input.search ? `%${input.search}%` : null;
  const minSuppliers = input.productId ? 1 : input.minSuppliers;

  const rows = await prisma.$queryRaw<PriceRow[]>`
    WITH po_lines AS (
      SELECT poi.product_id, poi.variant_id, po.supplier_id, po.created_at, poi.quantity,
             poi.unit_cost * (1 - poi.discount_percent / 100) AS net_cost,
             ROW_NUMBER() OVER (PARTITION BY poi.product_id, IFNULL(poi.variant_id, 0), po.supplier_id
                                ORDER BY po.created_at DESC, poi.id DESC) AS rn
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
             AND (po.status <> 'cancelled' OR poi.received_quantity > 0)
        JOIN products p ON p.id = poi.product_id
        LEFT JOIN product_variants v ON v.id = poi.variant_id
       WHERE (${productFilter} IS NULL OR poi.product_id = ${productFilter})
         AND (${search} IS NULL OR p.name LIKE ${search} OR p.sku LIKE ${search} OR v.sku LIKE ${search})
    ),
    eligible AS (
      SELECT product_id, IFNULL(variant_id, 0) AS vkey
        FROM po_lines
       GROUP BY product_id, IFNULL(variant_id, 0)
      HAVING COUNT(DISTINCT supplier_id) >= ${minSuppliers}
         AND (${supplierFilter} IS NULL OR SUM(supplier_id = ${supplierFilter}) > 0)
       ORDER BY product_id, vkey
       LIMIT ${input.limit}
    )
    SELECT l.product_id, l.variant_id, p.name AS product_name, IFNULL(v.sku, p.sku) AS sku, p.unit,
           s.id AS supplier_id, s.code AS supplier_code, s.name AS supplier_name,
           MAX(CASE WHEN l.rn = 1 THEN l.net_cost END) AS last_cost,
           MAX(l.created_at) AS last_at,
           MIN(l.net_cost) AS min_cost, MAX(l.net_cost) AS max_cost,
           SUM(l.net_cost * l.quantity) / NULLIF(SUM(l.quantity), 0) AS avg_cost,
           SUM(l.quantity) AS total_qty, COUNT(*) AS po_count
      FROM po_lines l
      JOIN eligible e ON e.product_id = l.product_id AND e.vkey = IFNULL(l.variant_id, 0)
      JOIN products p ON p.id = l.product_id
      LEFT JOIN product_variants v ON v.id = l.variant_id
      JOIN suppliers s ON s.id = l.supplier_id
     GROUP BY l.product_id, l.variant_id, s.id
     ORDER BY p.name, sku, last_cost`;

  const groups = new Map<
    string,
    {
      productId: number;
      variantId: number | null;
      name: string;
      sku: string;
      unit: string | null;
      suppliers: {
        supplierId: number;
        code: string;
        name: string;
        lastCost: number;
        lastAt: Date;
        minCost: number;
        maxCost: number;
        avgCost: number;
        totalQty: number;
        poCount: number;
        isCheapest: boolean;
        diffPercent: number;
      }[];
    }
  >();
  for (const r of rows) {
    const key = `${r.product_id}:${r.variant_id ?? 0}`;
    const g = groups.get(key) ?? {
      productId: Number(r.product_id),
      variantId: r.variant_id === null ? null : Number(r.variant_id),
      name: r.product_name,
      sku: r.sku,
      unit: r.unit,
      suppliers: [],
    };
    g.suppliers.push({
      supplierId: Number(r.supplier_id),
      code: r.supplier_code,
      name: r.supplier_name,
      lastCost: round2(Number(r.last_cost)),
      lastAt: new Date(r.last_at),
      minCost: round2(Number(r.min_cost)),
      maxCost: round2(Number(r.max_cost)),
      avgCost: round2(Number(r.avg_cost)),
      totalQty: Number(r.total_qty),
      poCount: Number(r.po_count),
      isCheapest: false,
      diffPercent: 0,
    });
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    g.suppliers.sort((a, b) => a.lastCost - b.lastCost || a.name.localeCompare(b.name));
    const best = g.suppliers[0]?.lastCost ?? 0;
    for (const s of g.suppliers) {
      s.isCheapest = s.lastCost === best;
      s.diffPercent = best > 0 ? round2(((s.lastCost - best) / best) * 100) : 0;
    }
    const worst = g.suppliers[g.suppliers.length - 1]?.lastCost ?? 0;
    return {
      ...g,
      bestCost: best,
      /** How much buying from the cheapest saves vs the most expensive, per unit */
      spread: round2(worst - best),
    };
  });
}
