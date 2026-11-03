import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getRedis } from "@/lib/redis";
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  ListInventoryInput,
  CreateTransactionInput,
  ListTransactionsInput,
  CreateStockTakeInput,
  UpdateStockTakeItemsInput,
  ListBatchesInput,
} from "@/lib/validators/inventory";

// Prisma 7: nullable field in compound unique cannot be null in where clause — use findFirst + update/create
async function upsertInventory(
  trx: Prisma.TransactionClient,
  productId: number,
  warehouseId: number,
  variantId: number | null | undefined,
  delta: number,
) {
  const existing = await trx.inventory.findFirst({
    where: { productId, warehouseId, variantId: variantId ?? null },
  });
  if (existing) {
    await trx.inventory.update({
      where: { id: existing.id },
      data: { quantity: { increment: delta } },
    });
  } else {
    await trx.inventory.create({
      data: {
        productId,
        warehouseId,
        variantId: variantId ?? null,
        quantity: delta,
        minQuantity: 0,
      },
    });
  }
}

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

// ─── Warehouse ───────────────────────────────────────────────────────────────

export async function listWarehouses(_tenantId: string) {
  const prisma = getPrisma();
  return prisma.warehouse.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getWarehouse(id: number) {
  const prisma = getPrisma();
  const wh = await prisma.warehouse.findUnique({
    where: { id },
    include: { _count: { select: { inventory: true } } },
  });
  if (!wh) throw notFound(`Kho #${id} không tồn tại`);
  return wh;
}

export async function createWarehouse(data: CreateWarehouseInput) {
  const prisma = getPrisma();
  const existing = await prisma.warehouse.findUnique({ where: { code: data.code } });
  if (existing) throw conflict(`Mã kho "${data.code}" đã tồn tại`);
  return prisma.warehouse.create({ data: { ...data, branchId: data.branchId ?? null } });
}

export async function updateWarehouse(id: number, data: UpdateWarehouseInput) {
  const prisma = getPrisma();
  const wh = await prisma.warehouse.findUnique({ where: { id } });
  if (!wh) throw notFound(`Kho #${id} không tồn tại`);
  if (data.code && data.code !== wh.code) {
    const dup = await prisma.warehouse.findUnique({ where: { code: data.code } });
    if (dup) throw conflict(`Mã kho "${data.code}" đã tồn tại`);
  }
  return prisma.warehouse.update({ where: { id }, data });
}

export async function deleteWarehouse(id: number) {
  const prisma = getPrisma();
  const wh = await prisma.warehouse.findUnique({
    where: { id },
    include: { _count: { select: { inventory: true } } },
  });
  if (!wh) throw notFound(`Kho #${id} không tồn tại`);
  if (wh._count.inventory > 0)
    throw conflict("Không thể xóa kho còn tồn kho. Vui lòng chuyển tồn về 0 trước.");
  return prisma.warehouse.delete({ where: { id } });
}

// ─── Inventory (tồn kho hiện tại) ─────────────────────────────────────────

export async function listInventory(input: ListInventoryInput) {
  const prisma = getPrisma();
  const q = input.search?.trim();
  const where: Prisma.InventoryWhereInput = {
    ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(q
      ? {
          product: {
            OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }],
          },
        }
      : {}),
  };

  // quantity <= product.minStock compares two tables, which Prisma cannot express in `where`.
  // Resolve the matching ids first so that count and pagination stay correct.
  if (input.lowStock) {
    const candidates = await prisma.inventory.findMany({
      where: { AND: [where, { product: { minStock: { gt: 0 } } }] },
      select: { id: true, quantity: true, product: { select: { minStock: true } } },
    });
    where.id = {
      in: candidates.filter((c) => Number(c.quantity) <= c.product.minStock).map((c) => c.id),
    };
  }

  const [items, total] = await prisma.$transaction([
    prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            unit: true,
            minStock: true,
            status: true,
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, sku: true } },
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
    }),
    prisma.inventory.count({ where }),
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

/** Tổng số lượng tồn theo từng kho — dữ liệu cho biểu đồ tồn kho */
export async function getStockByWarehouse() {
  const prisma = getPrisma();
  const [groups, warehouses] = await prisma.$transaction([
    prisma.inventory.groupBy({
      by: ["warehouseId"],
      _sum: { quantity: true },
      _count: { _all: true },
      orderBy: { warehouseId: "asc" },
    }),
    prisma.warehouse.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return warehouses.map((wh) => {
    const g = groups.find((x) => x.warehouseId === wh.id);
    return {
      ...wh,
      totalQuantity: Number(g?._sum?.quantity ?? 0),
      itemCount: typeof g?._count === "object" ? (g._count._all ?? 0) : 0,
    };
  });
}

export async function getInventorySummary(warehouseId?: number) {
  const prisma = getPrisma();
  const where = warehouseId ? { warehouseId } : {};

  // Count products with low stock using Prisma relation filter
  // quantity <= product.minStock is approximated by fetching low-stock items
  const [totalProducts, lowStockItems] = await prisma.$transaction([
    prisma.inventory.count({ where }),
    prisma.inventory.findMany({
      where: {
        ...where,
        product: { minStock: { gt: 0 } },
      },
      select: { quantity: true, product: { select: { minStock: true } } },
    }),
  ]);

  const lowStock = lowStockItems.filter(
    (i) => Number(i.quantity) <= (i.product?.minStock ?? 0),
  ).length;

  return { totalProducts, lowStock };
}

// ─── Inventory Transaction types ─────────────────────────────────────────────

export async function listTransactionTypes() {
  const prisma = getPrisma();
  return prisma.inventoryTransactionType.findMany({ orderBy: { name: "asc" } });
}

// ─── Inventory Transaction ────────────────────────────────────────────────────

function generateTxCode(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `TX-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export async function listTransactions(input: ListTransactionsInput) {
  const prisma = getPrisma();
  const where = {
    ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
    ...(input.destinationWarehouseId
      ? { destinationWarehouseId: input.destinationWarehouseId }
      : {}),
    ...(input.transactionTypeId ? { transactionTypeId: input.transactionTypeId } : {}),
    ...(input.status ? { status: input.status as "draft" | "confirmed" | "cancelled" } : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          createdAt: {
            ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.inventoryTransaction.findMany({
      where,
      include: {
        transactionType: { select: { id: true, code: true, name: true, direction: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        destinationWarehouse: { select: { id: true, name: true, code: true } },
        _count: { select: { inventoryTransactionItems: true } },
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryTransaction.count({ where }),
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

export async function getTransaction(id: number) {
  const prisma = getPrisma();
  const tx = await prisma.inventoryTransaction.findUnique({
    where: { id },
    include: {
      transactionType: true,
      warehouse: true,
      destinationWarehouse: true,
      inventoryTransactionItems: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
          variant: { select: { id: true, sku: true } },
          batch: true,
        },
      },
    },
  });
  if (!tx) throw notFound(`Phiếu kho #${id} không tồn tại`);
  return tx;
}

export async function createTransaction(input: CreateTransactionInput, userId: number | null) {
  const prisma = getPrisma();
  const txType = await prisma.inventoryTransactionType.findUnique({
    where: { id: input.transactionTypeId },
  });
  if (!txType) throw notFound(`Loại phiếu #${input.transactionTypeId} không tồn tại`);

  const wh = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!wh) throw notFound(`Kho #${input.warehouseId} không tồn tại`);

  if (input.destinationWarehouseId) {
    if (input.destinationWarehouseId === input.warehouseId)
      throw conflict("Kho đích phải khác kho nguồn");
    const dest = await prisma.warehouse.findUnique({ where: { id: input.destinationWarehouseId } });
    if (!dest) throw notFound(`Kho #${input.destinationWarehouseId} không tồn tại`);
  }

  // Lô/HSD: phiếu nhập tạo lô mới (số lượng 0, cộng khi xác nhận); phiếu xuất phải chọn lô đã có
  const batchIds: (number | null)[] = [];
  for (const item of input.items) {
    if (!item.batchCode) {
      batchIds.push(null);
      continue;
    }
    const existing = await prisma.inventoryBatch.findFirst({
      where: {
        productId: item.productId,
        warehouseId: input.warehouseId,
        batchCode: item.batchCode,
      },
    });
    if (existing) {
      batchIds.push(existing.id);
    } else if (txType.direction === "in") {
      const created = await prisma.inventoryBatch.create({
        data: {
          productId: item.productId,
          warehouseId: input.warehouseId,
          batchCode: item.batchCode,
          quantity: 0,
          costPrice: item.unitCost ?? null,
          manufactureDate: item.manufactureDate ? new Date(item.manufactureDate) : null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        },
      });
      batchIds.push(created.id);
    } else {
      throw notFound(`Lô "${item.batchCode}" không có trong kho ${wh.name}`);
    }
  }

  const code = generateTxCode();

  const tx = await prisma.inventoryTransaction.create({
    data: {
      transactionCode: code,
      transactionTypeId: input.transactionTypeId,
      warehouseId: input.warehouseId,
      destinationWarehouseId: input.destinationWarehouseId ?? null,
      notes: input.notes ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: userId,
      status: "draft",
      inventoryTransactionItems: {
        create: input.items.map((item, i) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          batchId: batchIds[i],
          quantity: item.quantity,
          unitCost: item.unitCost ?? null,
          notes: item.notes ?? null,
        })),
      },
    },
    include: {
      inventoryTransactionItems: true,
      transactionType: true,
      warehouse: true,
    },
  });

  return tx;
}

export async function confirmTransaction(id: number, _userId: number | null) {
  const prisma = getPrisma();
  const tx = await prisma.inventoryTransaction.findUnique({
    where: { id },
    include: {
      inventoryTransactionItems: { include: { batch: true, product: { select: { name: true } } } },
      transactionType: true,
    },
  });
  if (!tx) throw notFound(`Phiếu kho #${id} không tồn tại`);
  if (tx.status !== "draft")
    throw conflict(`Phiếu kho đang ở trạng thái "${tx.status}", không thể xác nhận`);

  const direction = tx.transactionType.direction; // "in" | "out"

  await prisma.$transaction(async (trx) => {
    // Update transaction status
    await trx.inventoryTransaction.update({ where: { id }, data: { status: "confirmed" } });

    // Update inventory quantities
    for (const item of tx.inventoryTransactionItems) {
      const qty = Number(item.quantity);
      const delta = direction === "in" ? qty : -qty;

      if (direction === "out") {
        const current = await trx.inventory.findFirst({
          where: {
            productId: item.productId,
            warehouseId: tx.warehouseId,
            variantId: item.variantId ?? null,
          },
          select: { quantity: true },
        });
        const available = Number(current?.quantity ?? 0);
        if (available < qty) {
          throw conflict(
            `"${item.product.name}" chỉ còn ${available} trong kho, không đủ xuất ${qty}`,
          );
        }
      }

      await upsertInventory(trx, item.productId, tx.warehouseId, item.variantId, delta);
      if (item.batchId) {
        await trx.inventoryBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: delta } },
        });
      }

      // For transfer: also update destination warehouse
      if (direction === "out" && tx.destinationWarehouseId) {
        await upsertInventory(trx, item.productId, tx.destinationWarehouseId, item.variantId, qty);
        if (item.batch) {
          const destBatch = await trx.inventoryBatch.findFirst({
            where: {
              productId: item.productId,
              warehouseId: tx.destinationWarehouseId,
              batchCode: item.batch.batchCode,
            },
          });
          if (destBatch) {
            await trx.inventoryBatch.update({
              where: { id: destBatch.id },
              data: { quantity: { increment: qty } },
            });
          } else {
            await trx.inventoryBatch.create({
              data: {
                productId: item.productId,
                warehouseId: tx.destinationWarehouseId,
                batchCode: item.batch.batchCode,
                quantity: qty,
                costPrice: item.batch.costPrice,
                manufactureDate: item.batch.manufactureDate,
                expiryDate: item.batch.expiryDate,
              },
            });
          }
        }
      }
    }
  });

  // Publish low-stock alert via Redis pub/sub
  await publishLowStockAlerts(
    tx.warehouseId,
    tx.inventoryTransactionItems.map((i) => i.productId),
  );

  return prisma.inventoryTransaction.findUnique({
    where: { id },
    include: { transactionType: true, warehouse: true },
  });
}

export async function cancelTransaction(id: number) {
  const prisma = getPrisma();
  const tx = await prisma.inventoryTransaction.findUnique({ where: { id } });
  if (!tx) throw notFound(`Phiếu kho #${id} không tồn tại`);
  if (tx.status === "confirmed") throw conflict("Phiếu đã xác nhận không thể huỷ");
  return prisma.inventoryTransaction.update({ where: { id }, data: { status: "cancelled" } });
}

// ─── Low-stock alerts ─────────────────────────────────────────────────────────

async function publishLowStockAlerts(warehouseId: number, productIds: number[]) {
  try {
    const prisma = getPrisma();
    const redis = getRedis();
    const lowStockItems = await prisma.inventory.findMany({
      where: {
        warehouseId,
        productId: { in: productIds },
        product: { minStock: { gt: 0 } },
      },
      include: { product: { select: { id: true, name: true, sku: true, minStock: true } } },
    });
    const alerts = lowStockItems.filter(
      (inv) => Number(inv.quantity) <= (inv.product.minStock ?? 0),
    );
    if (alerts.length > 0) {
      await redis.publish("bizone:low-stock", JSON.stringify({ warehouseId, alerts }));
    }
  } catch {
    // non-critical — don't fail the main operation
  }
}

// ─── Inventory Batches ────────────────────────────────────────────────────────

export async function listBatches(input: ListBatchesInput) {
  const prisma = getPrisma();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const where = {
    ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.expired ? { expiryDate: { lt: now } } : {}),
    ...(input.expiringSoon && !input.expired ? { expiryDate: { gte: now, lte: soon } } : {}),
    quantity: { gt: 0 },
  };

  const [items, total] = await prisma.$transaction([
    prisma.inventoryBatch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { expiryDate: "asc" },
    }),
    prisma.inventoryBatch.count({ where }),
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

// ─── Stock Take ───────────────────────────────────────────────────────────────

function generateStockTakeCode(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `KK-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createStockTake(input: CreateStockTakeInput, userId: number | null) {
  const prisma = getPrisma();
  const wh = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!wh) throw notFound(`Kho #${input.warehouseId} không tồn tại`);

  // Pre-populate items from current inventory
  const inventory = await prisma.inventory.findMany({
    where: { warehouseId: input.warehouseId },
    select: { productId: true, variantId: true, quantity: true },
  });

  const code = generateStockTakeCode();

  return prisma.stockTakeNote.create({
    data: {
      code,
      warehouseId: input.warehouseId,
      notes: input.notes ?? null,
      createdBy: userId,
      status: "draft",
      stockTakeItems: {
        create: inventory.map((inv) => ({
          productId: inv.productId,
          variantId: inv.variantId ?? null,
          systemQuantity: inv.quantity,
          actualQuantity: inv.quantity, // default = system qty; user will update
          difference: 0,
        })),
      },
    },
    include: { stockTakeItems: { take: 10 }, _count: { select: { stockTakeItems: true } } },
  });
}

export async function getStockTake(id: number) {
  const prisma = getPrisma();
  const note = await prisma.stockTakeNote.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      stockTakeItems: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
          variant: { select: { id: true, sku: true } },
        },
        orderBy: { productId: "asc" },
      },
    },
  });
  if (!note) throw notFound(`Phiếu kiểm kê #${id} không tồn tại`);
  return note;
}

export async function listStockTakes(
  warehouseId?: number,
  status?: string,
  page = 1,
  pageSize = 20,
) {
  const prisma = getPrisma();
  const where = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(status ? { status: status as "draft" | "in_progress" | "completed" | "cancelled" } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.stockTakeNote.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        _count: { select: { stockTakeItems: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.stockTakeNote.count({ where }),
  ]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function updateStockTakeItems(input: UpdateStockTakeItemsInput) {
  const prisma = getPrisma();
  const note = await prisma.stockTakeNote.findUnique({ where: { id: input.stockTakeId } });
  if (!note) throw notFound(`Phiếu kiểm kê #${input.stockTakeId} không tồn tại`);
  if (note.status === "completed" || note.status === "cancelled") {
    throw conflict(`Phiếu kiểm kê đang ở trạng thái "${note.status}", không thể cập nhật`);
  }

  const existingItems = await prisma.stockTakeItem.findMany({
    where: { stockTakeId: input.stockTakeId },
    select: { productId: true, variantId: true, systemQuantity: true },
  });
  const systemQty = (productId: number, variantId: number | null) =>
    Number(
      existingItems.find((e) => e.productId === productId && e.variantId === variantId)
        ?.systemQuantity ?? 0,
    );

  await prisma.$transaction([
    // Move to in_progress if still draft
    note.status === "draft"
      ? prisma.stockTakeNote.update({ where: { id: note.id }, data: { status: "in_progress" } })
      : prisma.stockTakeNote.findUnique({ where: { id: note.id } }), // no-op
    ...input.items.map((item) =>
      prisma.stockTakeItem.updateMany({
        where: {
          stockTakeId: input.stockTakeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
        },
        data: {
          actualQuantity: item.actualQuantity,
          difference: item.actualQuantity - systemQty(item.productId, item.variantId ?? null),
          unitCost: item.unitCost ?? null,
          notes: item.notes ?? null,
        },
      }),
    ),
  ]);

  return getStockTake(input.stockTakeId);
}

export async function completeStockTake(stockTakeId: number, userId: number | null) {
  const prisma = getPrisma();
  const note = await prisma.stockTakeNote.findUnique({
    where: { id: stockTakeId },
    include: { stockTakeItems: true },
  });
  if (!note) throw notFound(`Phiếu kiểm kê #${stockTakeId} không tồn tại`);
  if (note.status === "completed") throw conflict("Phiếu kiểm kê đã hoàn thành");
  if (note.status === "cancelled") throw conflict("Phiếu kiểm kê đã huỷ");

  await prisma.$transaction(async (trx) => {
    // Recalculate differences and update inventory to match actual quantities
    for (const item of note.stockTakeItems) {
      const diff = Number(item.actualQuantity) - Number(item.systemQuantity);

      // Update difference
      await trx.stockTakeItem.update({
        where: { id: item.id },
        data: { difference: diff },
      });

      // Adjust inventory to match actual (set exact quantity, not increment)
      const existingInv = await trx.inventory.findFirst({
        where: {
          productId: item.productId,
          warehouseId: note.warehouseId,
          variantId: item.variantId ?? null,
        },
      });
      if (existingInv) {
        await trx.inventory.update({
          where: { id: existingInv.id },
          data: { quantity: item.actualQuantity },
        });
      } else {
        await trx.inventory.create({
          data: {
            productId: item.productId,
            warehouseId: note.warehouseId,
            variantId: item.variantId ?? null,
            quantity: item.actualQuantity,
            minQuantity: 0,
          },
        });
      }
    }

    // Mark completed
    await trx.stockTakeNote.update({
      where: { id: stockTakeId },
      data: { status: "completed", approvedBy: userId, completedAt: new Date() },
    });
  });

  return getStockTake(stockTakeId);
}

export async function cancelStockTake(stockTakeId: number) {
  const prisma = getPrisma();
  const note = await prisma.stockTakeNote.findUnique({ where: { id: stockTakeId } });
  if (!note) throw notFound(`Phiếu kiểm kê #${stockTakeId} không tồn tại`);
  if (note.status === "completed") throw conflict("Phiếu kiểm kê đã hoàn thành, không thể huỷ");
  return prisma.stockTakeNote.update({ where: { id: stockTakeId }, data: { status: "cancelled" } });
}
