import { getPrisma } from "@/lib/prisma";
import { bizoneError } from "@/lib/errors";
import { dbDate, vnDateKey, vnDateKeyRange } from "@/lib/vn-time";
import type { Prisma } from "@/generated/prisma/client";
import {
  addDays,
  debtStatus,
  isOverdue,
  lineTotal,
  netUnitCost,
  paymentTermDays,
  poTotals,
  receivedDebtAmount,
  round2,
} from "@/lib/supplier/calc";
import type {
  CancelPoInput,
  CreatePoInput,
  ListPoInput,
  PoItemInput,
  ProductLookupInput,
  ReceivePoInput,
  UpdatePoInput,
} from "@/lib/validators/supplier";
import { publishLowStockAlerts, upsertInventory } from "@/server/services/inventory.service";

const conflict = (msg: string) => bizoneError("CONFLICT", msg);
const notFound = (msg: string) => bizoneError("NOT_FOUND", msg);
const invalid = (msg: string) => bizoneError("VALIDATION_ERROR", msg);

/** Inventory transaction type created when goods of a PO arrive (seeded: direction "in") */
const RECEIPT_TYPE_CODE = "purchase_receipt";
export const PO_REFERENCE_TYPE = "purchase_order";

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function generatePoCode(now = new Date()): string {
  const ymd = vnDateKey(now).replaceAll("-", "");
  return `PO-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function generateReceiptCode(now = new Date()): string {
  const ymd = vnDateKey(now).replaceAll("-", "");
  return `PN-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Serialize all PO mutations of one order (receive / cancel / edit / pay) */
async function lockPo(trx: Prisma.TransactionClient, id: number) {
  await trx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
}

// ─── Validation helpers ─────────────────────────────────────────────────────

async function assertSupplierUsable(supplierId: number) {
  const supplier = await getPrisma().supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw notFound(`Nhà cung cấp #${supplierId} không tồn tại`);
  if (!supplier.isActive) throw conflict(`Nhà cung cấp "${supplier.name}" đã ngừng hợp tác`);
  return supplier;
}

async function assertWarehouseUsable(warehouseId: number) {
  const wh = await getPrisma().warehouse.findUnique({ where: { id: warehouseId } });
  if (!wh) throw notFound(`Kho #${warehouseId} không tồn tại`);
  if (!wh.isActive) throw conflict(`Kho "${wh.name}" đã ngừng hoạt động`);
  return wh;
}

async function assertProducts(items: PoItemInput[]) {
  const prisma = getPrisma();
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, productVariants: { select: { id: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p) throw notFound(`Sản phẩm #${item.productId} không tồn tại`);
    if (item.variantId && !p.productVariants.some((v) => v.id === item.variantId)) {
      throw invalid(`Biến thể #${item.variantId} không thuộc sản phẩm "${p.name}"`);
    }
  }
}

function computeTotals(input: Pick<CreatePoInput, "items" | "discountAmount" | "taxAmount">) {
  try {
    return poTotals(input.items, input.discountAmount, input.taxAmount);
  } catch (e) {
    throw invalid(e instanceof Error ? e.message : String(e));
  }
}

function itemRows(items: PoItemInput[]) {
  return items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    quantity: i.quantity,
    unitCost: i.unitCost,
    discountPercent: i.discountPercent,
    totalAmount: lineTotal(i.quantity, i.unitCost, i.discountPercent),
  }));
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listPurchaseOrders(input: ListPoInput, scope?: number[] | null) {
  const prisma = getPrisma();
  const range =
    input.dateFrom || input.dateTo
      ? vnDateKeyRange(input.dateFrom ?? "2000-01-01", input.dateTo ?? "2999-12-31")
      : null;
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(input.warehouseId
      ? { warehouseId: input.warehouseId }
      : scope
        ? { warehouseId: { in: scope } }
        : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    ...(input.search
      ? {
          OR: [
            { poCode: { contains: input.search } },
            { supplier: { name: { contains: input.search } } },
            { notes: { contains: input.search } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        purchaseOrderItems: { select: { quantity: true, receivedQuantity: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  const debts = await prisma.supplierDebt.findMany({
    where: { poId: { in: rows.map((r) => r.id) } },
    select: { poId: true, remainingAmount: true },
  });
  const owed = new Map(debts.map((d) => [d.poId, num(d.remainingAmount)]));
  return {
    items: rows.map((po) => ({
      id: po.id,
      poCode: po.poCode,
      status: po.status,
      supplier: po.supplier,
      warehouse: po.warehouse,
      totalAmount: num(po.totalAmount),
      itemCount: po.purchaseOrderItems.length,
      orderedQty: po.purchaseOrderItems.reduce((s, i) => s + i.quantity, 0),
      receivedQty: po.purchaseOrderItems.reduce((s, i) => s + i.receivedQuantity, 0),
      remainingDebt: owed.get(po.id) ?? 0,
      createdAt: po.createdAt,
      notes: po.notes,
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getPurchaseOrder(id: number) {
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      warehouse: { select: { id: true, name: true, code: true } },
      createdByUser: { select: { id: true, fullName: true, username: true } },
      purchaseOrderItems: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
          variant: { select: { id: true, sku: true } },
        },
      },
      supplierPayments: { orderBy: [{ paymentDate: "desc" }, { id: "desc" }] },
    },
  });
  if (!po) throw notFound(`Đơn nhập #${id} không tồn tại`);

  const [debt, receipts] = await Promise.all([
    prisma.supplierDebt.findFirst({ where: { poId: id } }),
    prisma.inventoryTransaction.findMany({
      where: { referenceType: PO_REFERENCE_TYPE, referenceId: id },
      orderBy: { createdAt: "asc" },
      include: {
        inventoryTransactionItems: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            unitCost: true,
            batch: { select: { batchCode: true, expiryDate: true } },
          },
        },
      },
    }),
  ]);
  const todayKey = vnDateKey(new Date());
  const remaining = num(debt?.remainingAmount);

  return {
    id: po.id,
    poCode: po.poCode,
    status: po.status,
    notes: po.notes,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    createdBy: po.createdByUser,
    supplier: {
      id: po.supplier.id,
      code: po.supplier.code,
      name: po.supplier.name,
      phone: po.supplier.phone,
      paymentTerms: po.supplier.paymentTerms,
      isActive: po.supplier.isActive,
    },
    warehouse: po.warehouse,
    subtotal: num(po.subtotal),
    discountAmount: num(po.discountAmount),
    taxAmount: num(po.taxAmount),
    totalAmount: num(po.totalAmount),
    items: po.purchaseOrderItems.map((i) => ({
      id: i.id,
      product: i.product,
      variant: i.variant,
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
      unitCost: num(i.unitCost),
      discountPercent: num(i.discountPercent),
      netUnitCost: round2(netUnitCost(num(i.unitCost), num(i.discountPercent))),
      totalAmount: num(i.totalAmount),
    })),
    receipts: receipts.map((r) => ({
      id: r.id,
      code: r.transactionCode,
      status: r.status,
      createdAt: r.createdAt,
      notes: r.notes,
      items: r.inventoryTransactionItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: num(i.quantity),
        unitCost: num(i.unitCost),
        batchCode: i.batch?.batchCode ?? null,
        expiryDate: dateOnly(i.batch?.expiryDate),
      })),
    })),
    debt: debt
      ? {
          id: debt.id,
          totalAmount: num(debt.totalAmount),
          paidAmount: num(debt.paidAmount),
          remainingAmount: remaining,
          dueDate: dateOnly(debt.dueDate),
          status: debt.status,
          isOverdue: isOverdue(dateOnly(debt.dueDate), remaining, todayKey),
        }
      : null,
    payments: po.supplierPayments.map((p) => ({
      id: p.id,
      amount: num(p.amount),
      paymentDate: dateOnly(p.paymentDate),
      paymentMethod: p.paymentMethod,
      referenceCode: p.referenceCode,
      notes: p.notes,
    })),
  };
}

/**
 * Product search for the PO form: purchase cost (product / variant) plus, when a supplier is
 * chosen, the last price that supplier quoted — so buyers see at once if a price moved.
 */
export async function productLookup(input: ProductLookupInput) {
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    where: {
      status: { not: "discontinued" },
      OR: [
        { name: { contains: input.q } },
        { sku: { contains: input.q } },
        { barcode: { contains: input.q } },
        { productVariants: { some: { sku: { contains: input.q } } } },
      ],
    },
    take: input.limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      costPrice: true,
      productVariants: {
        where: { status: "active" },
        select: { id: true, sku: true, costPrice: true },
      },
    },
  });

  const last = new Map<string, { unitCost: number; date: Date }>();
  if (input.supplierId && products.length > 0) {
    const ids = products.map((p) => p.id);
    const rows = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: { in: ids },
        purchaseOrder: { supplierId: input.supplierId, status: { not: "cancelled" } },
      },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
      select: {
        productId: true,
        variantId: true,
        unitCost: true,
        discountPercent: true,
        purchaseOrder: { select: { createdAt: true } },
      },
    });
    for (const r of rows) {
      const key = `${r.productId}:${r.variantId ?? 0}`;
      if (!last.has(key)) {
        last.set(key, {
          unitCost: round2(netUnitCost(num(r.unitCost), num(r.discountPercent))),
          date: r.purchaseOrder.createdAt,
        });
      }
    }
  }

  return products.flatMap((p) => {
    const base = {
      productId: p.id,
      name: p.name,
      unit: p.unit,
    };
    const variants = p.productVariants.map((v) => ({
      ...base,
      variantId: v.id,
      sku: v.sku,
      costPrice: num(v.costPrice) || num(p.costPrice),
      lastSupplierCost: last.get(`${p.id}:${v.id}`) ?? null,
    }));
    return [
      {
        ...base,
        variantId: null as number | null,
        sku: p.sku,
        costPrice: num(p.costPrice),
        lastSupplierCost: last.get(`${p.id}:0`) ?? null,
      },
      ...variants,
    ];
  });
}

/** Active warehouses goods can be received into (PO form) */
export async function warehouseOptions(scope?: number[] | null) {
  return getPrisma().warehouse.findMany({
    where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, branchId: true },
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createPurchaseOrder(input: CreatePoInput, userId: number | null) {
  const prisma = getPrisma();
  const [, wh] = await Promise.all([
    assertSupplierUsable(input.supplierId),
    assertWarehouseUsable(input.warehouseId),
    assertProducts(input.items),
  ]);
  const totals = computeTotals(input);

  for (let attempt = 0; ; attempt++) {
    try {
      const po = await prisma.purchaseOrder.create({
        data: {
          poCode: generatePoCode(),
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          branchId: wh.branchId,
          ...totals,
          notes: input.notes || null,
          createdBy: userId,
          status: "pending",
          purchaseOrderItems: { create: itemRows(input.items) },
        },
        select: { id: true, poCode: true },
      });
      return po;
    } catch (e) {
      // P2002 = random code collided with an existing one — retry with a new code
      if ((e as { code?: string }).code === "P2002" && attempt < 3) continue;
      throw e;
    }
  }
}

/** Edit a PO before any goods arrived (status pending) — items are replaced as a whole */
export async function updatePurchaseOrder(input: UpdatePoInput) {
  const prisma = getPrisma();
  const [, wh] = await Promise.all([
    assertSupplierUsable(input.supplierId),
    assertWarehouseUsable(input.warehouseId),
    assertProducts(input.items),
  ]);
  const totals = computeTotals(input);

  return prisma.$transaction(async (trx) => {
    await lockPo(trx, input.id);
    const po = await trx.purchaseOrder.findUnique({
      where: { id: input.id },
      include: { purchaseOrderItems: { select: { receivedQuantity: true } } },
    });
    if (!po) throw notFound(`Đơn nhập #${input.id} không tồn tại`);
    if (po.status !== "pending" || po.purchaseOrderItems.some((i) => i.receivedQuantity > 0)) {
      throw conflict("Chỉ sửa được đơn nhập chưa nhận hàng (trạng thái Chờ nhập)");
    }
    await trx.purchaseOrderItem.deleteMany({ where: { poId: input.id } });
    return trx.purchaseOrder.update({
      where: { id: input.id },
      data: {
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        branchId: wh.branchId,
        ...totals,
        notes: input.notes || null,
        purchaseOrderItems: { create: itemRows(input.items) },
      },
      select: { id: true, poCode: true },
    });
  });
}

/**
 * Receive goods of a PO (full or partial): in one DB transaction
 *  1. a confirmed inventory receipt (type purchase_receipt, reference purchase_order/{id})
 *     raises stock (and batches) at the PO warehouse;
 *  2. received quantities and the PO status (partial / received) are updated;
 *  3. the PO's supplier debt grows to the value received so far (order discount / tax prorated).
 */
export async function receivePurchaseOrder(input: ReceivePoInput, userId: number | null) {
  const prisma = getPrisma();
  const receiptType = await prisma.inventoryTransactionType.findFirst({
    where: { code: RECEIPT_TYPE_CODE },
  });
  if (!receiptType) throw conflict(`Thiếu loại phiếu kho "${RECEIPT_TYPE_CODE}" (chạy db:seed)`);

  const result = await prisma.$transaction(async (trx) => {
    await lockPo(trx, input.id);
    const po = await trx.purchaseOrder.findUnique({
      where: { id: input.id },
      include: {
        supplier: { select: { paymentTerms: true } },
        warehouse: { select: { id: true, isActive: true, name: true } },
        purchaseOrderItems: {
          include: { product: { select: { name: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!po) throw notFound(`Đơn nhập #${input.id} không tồn tại`);
    if (po.status !== "pending" && po.status !== "partial") {
      throw conflict(po.status === "received" ? "Đơn nhập đã nhận đủ hàng" : "Đơn nhập đã bị huỷ");
    }
    if (!po.warehouse || !po.warehouseId) throw conflict("Đơn nhập chưa chọn kho nhận hàng");
    if (!po.warehouse.isActive) throw conflict(`Kho "${po.warehouse.name}" đã ngừng hoạt động`);
    const warehouseId = po.warehouseId;

    const byId = new Map(po.purchaseOrderItems.map((i) => [i.id, i]));
    const receiving = input.items.filter((r) => r.quantity > 0);
    const seen = new Set<number>();
    for (const r of receiving) {
      const item = byId.get(r.itemId);
      if (!item) throw invalid(`Dòng #${r.itemId} không thuộc đơn ${po.poCode}`);
      if (seen.has(r.itemId)) throw invalid(`Dòng "${item.product.name}" bị lặp`);
      seen.add(r.itemId);
      const left = item.quantity - item.receivedQuantity;
      if (r.quantity > left) {
        throw invalid(
          `"${item.product.name}" chỉ còn ${left} chưa nhận, không nhận được ${r.quantity}`,
        );
      }
      if (r.expiryDate && r.manufactureDate && r.expiryDate < r.manufactureDate) {
        throw invalid(`"${item.product.name}": hạn sử dụng trước ngày sản xuất`);
      }
    }

    // 1. Inventory receipt (+ batches)
    const lines: Prisma.InventoryTransactionItemCreateWithoutTransactionInput[] = [];
    for (const r of receiving) {
      const item = byId.get(r.itemId)!;
      const unitCost = round2(netUnitCost(num(item.unitCost), num(item.discountPercent)));
      let batchId: number | null = null;
      if (r.batchCode) {
        const batch =
          (await trx.inventoryBatch.findFirst({
            where: { productId: item.productId, warehouseId, batchCode: r.batchCode },
          })) ??
          (await trx.inventoryBatch.create({
            data: {
              productId: item.productId,
              warehouseId,
              batchCode: r.batchCode,
              quantity: 0,
              costPrice: unitCost,
              manufactureDate: r.manufactureDate ? dbDate(r.manufactureDate) : null,
              expiryDate: r.expiryDate ? dbDate(r.expiryDate) : null,
            },
          }));
        await trx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantity: { increment: r.quantity } },
        });
        batchId = batch.id;
      }
      await upsertInventory(trx, item.productId, warehouseId, item.variantId, r.quantity);
      lines.push({
        product: { connect: { id: item.productId } },
        ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
        ...(batchId ? { batch: { connect: { id: batchId } } } : {}),
        quantity: r.quantity,
        unitCost,
      });

      // 2. Received quantity — conditional so a concurrent receipt can't over-receive
      const { count } = await trx.purchaseOrderItem.updateMany({
        where: { id: item.id, receivedQuantity: item.receivedQuantity },
        data: { receivedQuantity: { increment: r.quantity } },
      });
      if (count === 0) throw conflict("Đơn nhập vừa được cập nhật, vui lòng tải lại");
      item.receivedQuantity += r.quantity;
    }

    const receipt = await trx.inventoryTransaction.create({
      data: {
        transactionCode: generateReceiptCode(),
        transactionTypeId: receiptType.id,
        warehouseId,
        referenceType: PO_REFERENCE_TYPE,
        referenceId: po.id,
        notes: input.notes || `Nhập hàng theo đơn ${po.poCode}`,
        createdBy: userId,
        status: "confirmed",
        inventoryTransactionItems: { create: lines },
      },
      select: { id: true, transactionCode: true },
    });

    const fullyReceived = po.purchaseOrderItems.every((i) => i.receivedQuantity >= i.quantity);
    await trx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: fullyReceived ? "received" : "partial" },
    });

    // 3. Supplier debt for the value received so far
    const owed = receivedDebtAmount(
      po.purchaseOrderItems.map((i) => ({
        quantity: i.quantity,
        receivedQuantity: i.receivedQuantity,
        unitCost: num(i.unitCost),
        discountPercent: num(i.discountPercent),
      })),
      { subtotal: num(po.subtotal), totalAmount: num(po.totalAmount) },
    );
    const debt = await trx.supplierDebt.findFirst({ where: { poId: po.id } });
    if (debt) {
      const paid = num(debt.paidAmount);
      await trx.supplierDebt.update({
        where: { id: debt.id },
        data: {
          totalAmount: owed,
          remainingAmount: round2(Math.max(0, owed - paid)),
          status: debtStatus(owed, paid),
          ...(input.dueDate ? { dueDate: dbDate(input.dueDate) } : {}),
        },
      });
    } else {
      const days = paymentTermDays(po.supplier.paymentTerms);
      const dueKey = input.dueDate ?? (days ? addDays(vnDateKey(new Date()), days) : null);
      await trx.supplierDebt.create({
        data: {
          supplierId: po.supplierId,
          poId: po.id,
          totalAmount: owed,
          paidAmount: 0,
          remainingAmount: owed,
          dueDate: dueKey ? dbDate(dueKey) : null,
          status: debtStatus(owed, 0),
        },
      });
    }

    return {
      id: po.id,
      poCode: po.poCode,
      status: fullyReceived ? ("received" as const) : ("partial" as const),
      receipt,
      warehouseId,
      productIds: receiving.map((r) => byId.get(r.itemId)!.productId),
      debtTotal: owed,
    };
  });

  // Same low-stock alert path as a manual receipt (fail-silent)
  await publishLowStockAlerts(result.warehouseId, result.productIds).catch(() => undefined);
  const { warehouseId: _w, productIds: _p, ...out } = result;
  return out;
}

/**
 * Cancel a PO. Pending → nothing else changes. Partially received → the rest is cancelled:
 * received stock and the debt for it stay (the supplier still has to be paid for it).
 */
export async function cancelPurchaseOrder(input: CancelPoInput) {
  const prisma = getPrisma();
  return prisma.$transaction(async (trx) => {
    await lockPo(trx, input.id);
    const po = await trx.purchaseOrder.findUnique({ where: { id: input.id } });
    if (!po) throw notFound(`Đơn nhập #${input.id} không tồn tại`);
    if (po.status === "received") throw conflict("Đơn nhập đã nhận đủ hàng, không thể huỷ");
    if (po.status === "cancelled") throw conflict("Đơn nhập đã bị huỷ trước đó");
    const note = `[Huỷ ${vnDateKey(new Date())}${po.status === "partial" ? " phần chưa nhận" : ""}]${
      input.reason ? ` ${input.reason}` : ""
    }`;
    return trx.purchaseOrder.update({
      where: { id: input.id },
      data: { status: "cancelled", notes: po.notes ? `${po.notes}\n${note}` : note },
      select: { id: true, poCode: true, status: true },
    });
  });
}
