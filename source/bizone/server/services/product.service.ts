import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { notFound, conflict } from "@/lib/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
  SearchProductsInput,
} from "@/lib/validators/product";
import type { Prisma } from "@/generated/prisma/client";

const SEARCH_CACHE_TTL = 300; // 5 min

// ─── Category ────────────────────────────────────────────────────────────────

export async function getCategoryTree() {
  const prisma = getPrisma();
  const all = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, parentId: true, sortOrder: true, icon: true, isActive: true },
  });
  return buildTree(all);
}

type FlatCategory = { id: number; name: string; slug: string; parentId: number | null; sortOrder: number; icon: string | null; isActive: boolean };
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

export async function createCategory(data: { name: string; slug: string; parentId?: number | null; sortOrder?: number; icon?: string | null; isActive?: boolean }) {
  const prisma = getPrisma();
  const existing = await prisma.productCategory.findUnique({ where: { slug: data.slug } });
  if (existing) throw conflict(`Slug "${data.slug}" đã tồn tại`);
  return prisma.productCategory.create({ data });
}

export async function updateCategory(id: number, data: Partial<{ name: string; slug: string; parentId: number | null; sortOrder: number; icon: string | null; isActive: boolean }>) {
  const prisma = getPrisma();
  const cat = await prisma.productCategory.findUnique({ where: { id } });
  if (!cat) throw notFound("ProductCategory", id);
  if (data.slug && data.slug !== cat.slug) {
    const dup = await prisma.productCategory.findUnique({ where: { slug: data.slug } });
    if (dup) throw conflict(`Slug "${data.slug}" đã tồn tại`);
  }
  return prisma.productCategory.update({ where: { id }, data });
}

export async function deleteCategory(id: number) {
  const prisma = getPrisma();
  const cat = await prisma.productCategory.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!cat) throw notFound("ProductCategory", id);
  if (cat._count.products > 0) throw conflict(`Danh mục có ${cat._count.products} sản phẩm, không thể xoá`);
  if (cat._count.children > 0) throw conflict(`Danh mục có ${cat._count.children} danh mục con, không thể xoá`);
  return prisma.productCategory.delete({ where: { id } });
}

export async function reorderCategories(items: { id: number; sortOrder: number }[]) {
  const prisma = getPrisma();
  await prisma.$transaction(items.map((item) => prisma.productCategory.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })));
}

// ─── Product list ─────────────────────────────────────────────────────────────

export async function listProducts(input: ListProductsInput) {
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
        productImages: { select: { id: true, imageUrl: true, sortOrder: true }, orderBy: { sortOrder: "asc" }, take: 1 },
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

export async function createProduct(input: CreateProductInput, userId: number) {
  const prisma = getPrisma();

  // Validate SKU unique
  if (await prisma.product.findUnique({ where: { sku: input.sku } })) {
    throw conflict(`SKU "${input.sku}" đã tồn tại`);
  }
  // Validate barcode unique
  if (input.barcode && await prisma.product.findFirst({ where: { barcode: input.barcode } })) {
    throw conflict(`Barcode "${input.barcode}" đã tồn tại`);
  }
  // Validate variant SKUs
  const variantSkus = input.variants.map((v) => v.sku);
  if (variantSkus.length !== new Set(variantSkus).size) throw conflict("Biến thể có SKU trùng nhau");
  if (variantSkus.length > 0) {
    const dupVariant = await prisma.productVariant.findFirst({ where: { sku: { in: variantSkus } } });
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

export async function updateProduct(id: number, input: UpdateProductInput, userId: number) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound("Product", id);

  // Barcode unique check (excluding self)
  if (input.barcode && input.barcode !== existing.barcode) {
    const dup = await prisma.product.findFirst({ where: { barcode: input.barcode, id: { not: id } } });
    if (dup) throw conflict(`Barcode "${input.barcode}" đã tồn tại`);
  }

  return prisma.product.update({
    where: { id },
    data: { ...input, updatedBy: userId },
  });
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
    throw conflict("Sản phẩm đã có giao dịch, không thể xoá. Hãy đổi trạng thái thành 'discontinued'");
  }
  return prisma.product.delete({ where: { id } });
}

// ─── Search (Redis cache) ─────────────────────────────────────────────────────

export async function searchProducts(input: SearchProductsInput, tenantId: string) {
  const cacheKey = `search:products:${tenantId}:${JSON.stringify(input)}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ReturnType<typeof _doSearch>;

  const result = await _doSearch(input);
  await redis.setex(cacheKey, SEARCH_CACHE_TTL, JSON.stringify(result));
  return result;
}

async function _doSearch(input: SearchProductsInput) {
  const prisma = getPrisma();
  const { q, limit, categoryId, status } = input;
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { barcode: { contains: q } },
      ],
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

export async function invalidateSearchCache(tenantId: string) {
  const redis = getRedis();
  const pattern = `search:products:${tenantId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}
