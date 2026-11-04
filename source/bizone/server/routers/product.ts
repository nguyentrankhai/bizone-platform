import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  invalidateSearchCache,
} from "@/server/services/product.service";
import {
  listProductsSchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validators/product";
import {
  parseProductImport,
  exportProductsToExcel,
  generateProductTemplate,
} from "@/lib/excel/product";
import { getPrisma } from "@/lib/prisma";
import { auditTrpcCall } from "@/server/middleware/auditLog";

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
      const product = await createProduct(input, Number(ctx.user!.id));
      await invalidateSearchCache(ctx.tenantId!);
      void auditTrpcCall("product.create", ctx, product.id, null, {
        name: product.name,
        sku: product.sku,
      });
      return product;
    }),

  /** PUT /trpc/product.update */
  update: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive(), data: updateProductSchema }))
    .mutation(async ({ input, ctx }) => {
      const product = await updateProduct(input.id, input.data, Number(ctx.user!.id));
      await invalidateSearchCache(ctx.tenantId!);
      void auditTrpcCall("product.update", ctx, input.id, null, {
        fields: Object.keys(input.data),
      });
      return product;
    }),

  /** DELETE /trpc/product.delete */
  delete: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await deleteProduct(input.id);
      await invalidateSearchCache(ctx.tenantId!);
      void auditTrpcCall("product.delete", ctx, input.id);
      return { success: true };
    }),

  /** POST /trpc/product.importExcel — nhận base64 buffer, trả kết quả parse */
  importExcel: permissionProcedure("product:write")
    .input(z.object({ fileBase64: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const result = await parseProductImport(buffer.buffer as ArrayBuffer);
      if (result.success.length === 0) {
        return { imported: 0, errors: result.errors };
      }

      const prisma = getPrisma();
      let imported = 0;
      const errors = [...result.errors];

      // Insert valid rows — skip duplicates
      for (const [idx, row] of result.success.entries()) {
        try {
          const existing = await prisma.product.findUnique({ where: { sku: row.sku } });
          if (existing) {
            errors.push({
              row: idx + 2,
              sku: row.sku,
              errors: [`SKU "${row.sku}" đã tồn tại, bỏ qua`],
            });
            continue;
          }
          let categoryId: number | null = null;
          if (row.category) {
            const cat = await prisma.productCategory.findFirst({ where: { name: row.category } });
            categoryId = cat?.id ?? null;
          }
          await prisma.product.create({
            data: {
              name: row.name,
              sku: row.sku,
              barcode: row.barcode ?? null,
              categoryId,
              description: row.description ?? null,
              costPrice: row.costPrice,
              sellingPrice: row.sellingPrice,
              unit: row.unit,
              minStock: row.minStock,
              status: row.status,
            },
          });
          imported++;
        } catch {
          errors.push({ row: idx + 2, sku: row.sku, errors: ["Lỗi khi lưu sản phẩm"] });
        }
      }

      await invalidateSearchCache(ctx.tenantId!);
      return { imported, errors };
    }),

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
