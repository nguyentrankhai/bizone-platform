"use client";

import { apiContext } from "@/components/inventory/shared";
import { useApiAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { trpc } from "@/lib/trpc";

export function NewProductClient() {
  const router = useRouter();
  const auth = useApiAuth();

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
      apiContext(auth),
    );
    router.push("/products");
  }

  return <ProductForm categories={[]} onSave={handleSave} />;
}
