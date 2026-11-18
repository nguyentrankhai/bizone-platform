import { getPrisma } from "@/lib/prisma";
import { cached, invalidate, stableKey } from "@/lib/cache";
import { currentTenantId } from "@/lib/tenant";
import { notFound, conflict } from "@/lib/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
  SearchProductsInput,
} from "@/lib/validators/product";
import type { Prisma } from "@/generated/prisma/client";

// ─── Category ────────────────────────────────────────────────────────────────

export async function getCategoryTree() {
  const prisma = getPrisma();
  const all = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      icon: true,
      isActive: true,
    },
  });
  return buildTree(all);
}

type FlatCategory = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
  icon: string | null;
  isActive: boolean;
};
type TreeCategory = FlatCategory & { children: TreeCategory[] };

function buildTree(items: FlatCategory[]): TreeCategory[] {
  const map = new Map<number, TreeCategory>();
  for (const item of items) map.set(item.id, { ...item, children: [] });
  const roots: TreeCategory[] = [];
  for (const item of map.values()) {
    if (item.parentId === null) {
      roots.push(item);
    } else {
      map.get(item.parentId)?.children.push(item);
    }
  }
  return roots;
}

export async function createCategory(data: {
  name: string;
  slug: string;
  parentId?: number | null;
  sortOrder?: number;
  icon?: string | null;
  isActive?: boolean;
}) {
  const prisma = getPrisma();
  const existing = await prisma.productCategory.findUnique({ where: { slug: data.slug } });
  if (existing) throw conflict(`Slug "${data.slug}" đã tồn tại`);
  const created = await prisma.productCategory.create({ data });
  await invalidateProductCache();
  return created;
}

export async function updateCategory(
  id: number,
  data: Partial<{
    name: string;
    slug: string;
    parentId: number | null;
    sortOrder: number;
    icon: string | null;
    isActive: boolean;
  }>,
) {
  const prisma = getPrisma();
  const cat = await prisma.productCategory.findUnique({ where: { id } });
  if (!cat) throw notFound("ProductCategory", id);
  if (data.slug && data.slug !== cat.slug) {
    const dup = await prisma.productCategory.findUnique({ where: { slug: data.slug } });
    if (dup) throw conflict(`Slug "${data.slug}" đã tồn tại`);
  }
  const updated = await prisma.productCategory.update({ where: { id }, data });
  await invalidateProductCache();
  return updated;
}

export async function deleteCategory(id: number) {
  const prisma = getPrisma();
  const cat = await prisma.productCategory.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!cat) throw notFound("ProductCategory", id);
  if (cat._count.products > 0)
    throw conflict(`Danh mục có ${cat._count.products} sản phẩm, không thể xoá`);
  if (cat._count.children > 0)
    throw conflict(`Danh mục có ${cat._count.children} danh mục con, không thể xoá`);
  const deleted = await prisma.productCategory.delete({ where: { id } });
  await invalidateProductCache();
  return deleted;
}

export async function reorderCategories(items: { id: number; sortOrder: number }[]) {
  const prisma = getPrisma();
  await prisma.$transaction(
    items.map((item) =>
      prisma.productCategory.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
  await invalidateProductCache();
}

// ─── Product list ─────────────────────────────────────────────────────────────

/** P6.5: cache 5 phút theo input (không chứa tồn kho → chỉ đổi khi SP / danh mục đổi) */
export function listProducts(input: ListProductsInput) {
  return cached("products", `list:${stableKey(input)}`, () => loadProductList(input));
}

async function loadProductList(input: ListProductsInput) {
  const prisma = getPrisma();
  const { page, pageSize, search, categoryId, status, sortBy, sortDir } = input;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ],
    }),
    ...(categoryId !== undefined && categoryId !== null ? { categoryId } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: sortDir },
      include: {
        category: { select: { id: true, name: true } },
        productVariants: { select: { id: true, sku: true, sellingPrice: true, status: true } },
        productImages: {
          select: { id: true, imageUrl: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
        _count: { select: { productVariants: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ─── Product detail ───────────────────────────────────────────────────────────

export async function getProduct(id: number) {
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      productVariants: {
        include: { productVariantAttributes: true, productBarcodes: true },
        orderBy: { id: "asc" },
      },
      productUnits: { orderBy: [{ isBase: "desc" }, { id: "asc" }] },
      productImages: { orderBy: { sortOrder: "asc" } },
      productBarcodes: { where: { variantId: null } },
    },
  });
  if (!product) throw notFound("Product", id);
  return product;
}

// ─── Create product ───────────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput, userId: number | null) {
  const prisma = getPrisma();

  // Validate SKU unique
  if (await prisma.product.findUnique({ where: { sku: input.sku } })) {
    throw conflict(`SKU "${input.sku}" đã tồn tại`);
  }
  // Validate barcode unique
  if (input.barcode && (await prisma.product.findFirst({ where: { barcode: input.barcode } }))) {
    throw conflict(`Barcode "${input.barcode}" đã tồn tại`);
  }
  // Validate variant SKUs
  const variantSkus = input.variants.map((v) => v.sku);
  if (variantSkus.length !== new Set(variantSkus).size)
    throw conflict("Biến thể có SKU trùng nhau");
  if (variantSkus.length > 0) {
    const dupVariant = await prisma.productVariant.findFirst({
      where: { sku: { in: variantSkus } },
    });
    if (dupVariant) throw conflict(`Variant SKU "${dupVariant.sku}" đã tồn tại`);
  }

  return prisma.product.create({
    data: {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode ?? null,
      categoryId: input.categoryId ?? null,
      description: input.description ?? null,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      taxRate: input.taxRate,
      unit: input.unit,
      weight: input.weight ?? null,
      minStock: input.minStock,
      maxStock: input.maxStock ?? null,
      image: input.image ?? null,
      status: input.status,
      trackInventory: input.trackInventory,
      createdBy: userId,
      updatedBy: userId,
      productVariants: {
        create: input.variants.map((v) => ({
          sku: v.sku,
          barcode: v.barcode ?? null,
          image: v.image ?? null,
          costPrice: v.costPrice,
          sellingPrice: v.sellingPrice,
          weight: v.weight ?? null,
          productVariantAttributes: { create: v.attributes },
        })),
      },
      productUnits: { create: input.units },
      productImages: {
        create: input.images.map((url, idx) => ({ imageUrl: url, sortOrder: idx })),
      },
      productBarcodes: {
        create: input.barcodes.map((barcode) => ({ barcode })),
      },
    },
    include: { productVariants: true, productUnits: true },
  });
}

// ─── Update product ───────────────────────────────────────────────────────────

export async function updateProduct(id: number, input: UpdateProductInput, userId: number | null) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound("Product", id);

  // Barcode unique check (excluding self)
  if (input.barcode && input.barcode !== existing.barcode) {
    const dup = await prisma.product.findFirst({
      where: { barcode: input.barcode, id: { not: id } },
    });
    if (dup) throw conflict(`Barcode "${input.barcode}" đã tồn tại`);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { ...input, updatedBy: userId },
  });
  // Báo cáo cũ lấy danh mục của SP và giá vốn SP (dòng HĐ không có giá vốn) → đổi thì bỏ cache
  const history =
    updated.categoryId !== existing.categoryId ||
    String(updated.costPrice) !== String(existing.costPrice);
  await invalidateProductCache({ history });
  return updated;
}

// ─── Delete product ───────────────────────────────────────────────────────────

export async function deleteProduct(id: number) {
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { invoiceItems: true, orderItems: true } } },
  });
  if (!product) throw notFound("Product", id);
  if (product._count.invoiceItems > 0 || product._count.orderItems > 0) {
    throw conflict(
      "Sản phẩm đã có giao dịch, không thể xoá. Hãy đổi trạng thái thành 'discontinued'",
    );
  }
  return prisma.product.delete({ where: { id } });
}

// ─── Search (Redis cache) ─────────────────────────────────────────────────────

export function searchProducts(input: SearchProductsInput) {
  return cached("products", `search:${stableKey(input)}`, () => _doSearch(input));
}

async function _doSearch(input: SearchProductsInput) {
  const prisma = getPrisma();
  const { q, limit, categoryId, status } = input;
  return prisma.product.findMany({
    where: {
      OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }],
      ...(categoryId !== undefined && categoryId !== null ? { categoryId } : {}),
      ...(status ? { status } : {}),
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      sellingPrice: true,
      unit: true,
      image: true,
      status: true,
      category: { select: { id: true, name: true } },
      productVariants: {
        select: { id: true, sku: true, sellingPrice: true },
        where: { status: "active" },
      },
    },
  });
}

// ─── Redis cache invalidation ─────────────────────────────────────────────────

/**
 * Sản phẩm / danh mục đổi → bỏ cache danh sách + tìm kiếm SP và danh mục website. `history`:
 * thay đổi làm đổi báo cáo của các ngày đã qua (danh mục, giá vốn của SP) → bỏ cả cache báo cáo.
 */
export async function invalidateProductCache(
  opts: { history?: boolean } = {},
  tenantId: string = currentTenantId(),
) {
  await invalidate(
    opts.history ? ["products", "storeCatalog", "salesHistory"] : ["products", "storeCatalog"],
    tenantId,
  );
}
