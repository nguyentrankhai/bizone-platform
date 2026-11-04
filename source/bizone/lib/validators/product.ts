import { z } from "zod";

// ─── Category ───────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, "Slug chỉ gồm chữ thường, số và dấu gạch ngang"),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().default(0),
  icon: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const reorderCategoriesSchema = z.array(
  z.object({ id: z.number().int().positive(), sortOrder: z.number().int() }),
);

// ─── Product unit ────────────────────────────────────────────────────────────

export const productUnitSchema = z.object({
  unitName: z.string().min(1).max(50),
  conversionRate: z.number().positive().default(1),
  barcode: z.string().max(100).nullable().optional(),
  sellingPrice: z.number().nonnegative().nullable().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  isBase: z.boolean().default(false),
});

// ─── Product variant ─────────────────────────────────────────────────────────

export const productVariantSchema = z.object({
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).nullable().optional(),
  image: z.string().url().max(500).nullable().optional(),
  costPrice: z.number().nonnegative().default(0),
  sellingPrice: z.number().nonnegative().default(0),
  weight: z.number().nonnegative().nullable().optional(),
  attributes: z
    .array(
      z.object({
        attributeName: z.string().min(1).max(50),
        attributeValue: z.string().min(1).max(50),
      }),
    )
    .default([]),
});

// ─── Product CRUD ────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1).max(500),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  costPrice: z.number().nonnegative().default(0),
  sellingPrice: z.number().nonnegative().min(0),
  taxRate: z.number().min(0).max(100).default(0),
  unit: z.string().min(1).max(50),
  weight: z.number().nonnegative().nullable().optional(),
  minStock: z.number().int().nonnegative().default(0),
  maxStock: z.number().int().positive().nullable().optional(),
  image: z.string().url().max(500).nullable().optional(),
  status: z.enum(["active", "inactive", "discontinued"]).default("active"),
  trackInventory: z.boolean().default(true),
  variants: z.array(productVariantSchema).default([]),
  units: z.array(productUnitSchema).default([]),
  images: z.array(z.string().url().max(500)).default([]),
  barcodes: z.array(z.string().max(100)).default([]),
});

export const updateProductSchema = createProductSchema
  .omit({ sku: true, variants: true, units: true, images: true, barcodes: true })
  .partial()
  .extend({
    status: z.enum(["active", "inactive", "discontinued"]).optional(),
  });

// ─── List / search ───────────────────────────────────────────────────────────

export const listProductsSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "inactive", "discontinued"]).optional(),
  sortBy: z
    .enum(["name", "sku", "sellingPrice", "costPrice", "createdAt", "updatedAt"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const searchProductsSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
  categoryId: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "inactive", "discontinued"]).optional(),
});

// ─── Excel import ────────────────────────────────────────────────────────────

export const importProductRowSchema = z.object({
  name: z.string().min(1).max(500),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  costPrice: z.coerce.number().nonnegative().default(0),
  sellingPrice: z.coerce.number().nonnegative().default(0),
  unit: z.string().min(1).max(50),
  minStock: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(["active", "inactive", "discontinued"]).default("active"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;
export type SearchProductsInput = z.infer<typeof searchProductsSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ImportProductRow = z.infer<typeof importProductRowSchema>;
