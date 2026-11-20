import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  invalidateProductCache,
} from "@/server/services/product.service";
import {
  listProductsSchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validators/product";
import { exportProductsToExcel, generateProductTemplate } from "@/lib/excel/product";
import { getPrisma } from "@/lib/prisma";
import { resolveDbUserId } from "@/server/services/user.service";

export const productRouter = router({
  /** GET /trpc/product.list */
  list: permissionProcedure("product:read")
    .input(listProductsSchema)
    .query(async ({ input }) => {
      return listProducts(input);
    }),

  /** GET /trpc/product.get?id=... */
  get: permissionProcedure("product:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getProduct(input.id);
    }),

  /** POST /trpc/product.create */
  create: permissionProcedure("product:write")
    .input(createProductSchema)
    .mutation(async ({ input, ctx }) => {
      const product = await createProduct(input, await resolveDbUserId(ctx.user!));
      await invalidateProductCache();
      return product;
    }),

  /** PUT /trpc/product.update */
  update: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive(), data: updateProductSchema }))
    .mutation(async ({ input, ctx }) => {
      // updateProduct bỏ cache SP (+ báo cáo khi đổi danh mục / giá vốn)
      return updateProduct(input.id, input.data, await resolveDbUserId(ctx.user!));
    }),

  /** DELETE /trpc/product.delete */
  delete: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteProduct(input.id);
      await invalidateProductCache();
      return { success: true };
    }),

  // Excel import: POST /api/uploads/products (P6.6 — streamed + size / type checked, not base64 tRPC)

  /** GET /trpc/product.exportExcel — trả base64 xlsx */
  exportExcel: permissionProcedure("product:read")
    .input(listProductsSchema.omit({ page: true, pageSize: true }).partial())
    .query(async ({ input }) => {
      const prisma = getPrisma();
      const products = await prisma.product.findMany({
        where: {
          ...(input.search && {
            OR: [{ name: { contains: input.search } }, { sku: { contains: input.search } }],
          }),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { name: "asc" },
        include: { category: { select: { name: true } } },
        take: 5000,
      });

      const rows = products.map((p) => ({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        categoryName: p.category?.name ?? null,
        costPrice: p.costPrice.toNumber(),
        sellingPrice: p.sellingPrice.toNumber(),
        unit: p.unit,
        minStock: p.minStock,
        status: p.status,
      }));

      const buffer = await exportProductsToExcel(rows);
      return { fileBase64: Buffer.from(buffer).toString("base64"), count: rows.length };
    }),

  /** GET /trpc/product.exportTemplate — template xlsx để import */
  exportTemplate: permissionProcedure("product:read").query(async () => {
    const buffer = await generateProductTemplate();
    return { fileBase64: Buffer.from(buffer).toString("base64") };
  }),
});
