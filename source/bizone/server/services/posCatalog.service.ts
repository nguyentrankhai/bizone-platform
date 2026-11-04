import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Sellable products for the POS grid, with stock in the branch's selling warehouse */
export async function posCatalog(input: {
  branchId: number;
  categoryId?: number;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const prisma = getPrisma();
  const q = input.search?.trim();

  let categoryIds: number[] | undefined;
  if (input.categoryId) {
    // Include sub-categories (tree is at most 5 levels)
    const all = await prisma.productCategory.findMany({ select: { id: true, parentId: true } });
    categoryIds = [input.categoryId];
    for (let i = 0; i < categoryIds.length; i++) {
      for (const c of all) if (c.parentId === categoryIds[i]) categoryIds.push(c.id);
    }
  }

  const where: Prisma.ProductWhereInput = {
    status: "active",
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(q
      ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] }
      : {}),
  };

  const warehouse = await prisma.warehouse.findFirst({
    where: { branchId: input.branchId, isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        unit: true,
        image: true,
        sellingPrice: true,
        trackInventory: true,
        categoryId: true,
        productVariants: {
          where: { status: "active" },
          select: { id: true, sku: true, sellingPrice: true },
        },
        inventory: warehouse
          ? { where: { warehouseId: warehouse.id }, select: { variantId: true, quantity: true } }
          : { take: 0, select: { variantId: true, quantity: true } },
      },
      orderBy: { name: "asc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      image: p.image,
      categoryId: p.categoryId,
      price: Number(p.sellingPrice),
      trackInventory: p.trackInventory,
      stock: p.trackInventory ? p.inventory.reduce((s, i) => s + Number(i.quantity), 0) : null,
      variants: p.productVariants.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: Number(v.sellingPrice),
        stock: p.trackInventory
          ? Number(p.inventory.find((i) => i.variantId === v.id)?.quantity ?? 0)
          : null,
      })),
    })),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function activeBranches() {
  return getPrisma().branch.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      code: true,
      isDefault: true,
      _count: { select: { warehouses: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function findCustomers(q: string) {
  const term = q.trim();
  return getPrisma().customer.findMany({
    where: {
      isActive: true,
      OR: [{ phone: { contains: term } }, { fullName: { contains: term } }, { code: term }],
    },
    select: { id: true, code: true, fullName: true, phone: true, ranking: true, totalPoints: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
}

/** Store name and the bank account shown as VietQR on the customer display */
export async function storeInfo() {
  const rows = await getPrisma().storeConfig.findMany({
    where: {
      configKey: {
        in: [
          "store_name",
          "store_address",
          "store_phone",
          "bank_bin",
          "bank_name",
          "bank_account_no",
          "bank_account_name",
        ],
      },
    },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.configKey, r.configValue ?? ""]));
  return {
    name: cfg.store_name || "BizOne",
    address: cfg.store_address || "",
    phone: cfg.store_phone || "",
    bank:
      cfg.bank_bin && cfg.bank_account_no
        ? {
            bin: cfg.bank_bin,
            bankName: cfg.bank_name || "",
            accountNo: cfg.bank_account_no,
            accountName: cfg.bank_account_name || "",
          }
        : null,
  };
}
