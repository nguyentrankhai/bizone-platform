import { parseProductImport } from "@/lib/excel/product";
import { getPrisma } from "@/lib/prisma";
import { invalidateProductCache } from "@/server/services/product.service";

export interface ProductImportOutcome {
  imported: number;
  errors: { row: number; sku?: string; errors: string[] }[];
}

/**
 * Create products from a validated .xlsx (template of `generateProductTemplate`): rows with an
 * existing SKU are skipped and reported. Moved out of the tRPC router in P6.6 — the file now
 * arrives through `POST /api/uploads/products` (streamed, size / type checked by lib/upload.ts).
 */
export async function importProductsFromExcel(
  bytes: Uint8Array,
  userId: number | null,
): Promise<ProductImportOutcome> {
  // exceljs wants an ArrayBuffer of exactly this file's bytes
  const copy = bytes.slice().buffer as ArrayBuffer;
  const result = await parseProductImport(copy);
  if (result.success.length === 0) return { imported: 0, errors: result.errors };

  const prisma = getPrisma();
  let imported = 0;
  const errors = [...result.errors];

  // Insert valid rows — skip duplicates
  for (const row of result.success) {
    try {
      const existing = await prisma.product.findUnique({ where: { sku: row.sku } });
      if (existing) {
        errors.push({
          row: row.rowNumber,
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
          createdBy: userId,
          updatedBy: userId,
        },
      });
      imported++;
    } catch {
      errors.push({ row: row.rowNumber, sku: row.sku, errors: ["Lỗi khi lưu sản phẩm"] });
    }
  }

  await invalidateProductCache({ history: true });
  errors.sort((a, b) => a.row - b.row);
  return { imported, errors };
}
