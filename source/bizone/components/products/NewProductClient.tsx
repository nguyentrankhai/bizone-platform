"use client";

import { useRouter } from "next/navigation";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { trpc } from "@/lib/trpc";

interface NewProductClientProps {
  tenantId: string;
  authToken: string;
}

export function NewProductClient({ tenantId, authToken }: NewProductClientProps) {
  const router = useRouter();
  const headers = { Authorization: `Bearer ${authToken}`, "X-Tenant-ID": tenantId };

  async function handleSave(data: ProductFormData) {
    await trpc.product.create.mutate(
      {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || undefined,
        categoryId: data.categoryId ?? undefined,
        description: data.description || undefined,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        taxRate: data.taxRate,
        unit: data.unit,
        minStock: data.minStock,
        maxStock: data.maxStock ?? undefined,
        status: data.status,
        units: data.units.map((u) => ({
          unitName: u.unitName,
          conversionRate: u.conversionRate,
          barcode: u.barcode || undefined,
          sellingPrice: u.sellingPrice ?? undefined,
          costPrice: u.costPrice ?? undefined,
          isBase: u.isBase,
        })),
        variants: data.variants.map((v) => ({
          sku: v.sku,
          barcode: v.barcode || undefined,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          attributes: v.attributes,
        })),
      },
      { context: { headers } },
    );
    router.push("/products");
  }

  return <ProductForm categories={[]} onSave={handleSave} />;
}
