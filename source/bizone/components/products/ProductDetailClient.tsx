"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { trpc } from "@/lib/trpc";

interface ProductDetailClientProps {
  id: number;
  tenantId: string;
  authToken: string;
}

export function ProductDetailClient({ id, tenantId, authToken }: ProductDetailClientProps) {
  const router = useRouter();
  const headers = { Authorization: `Bearer ${authToken}`, "X-Tenant-ID": tenantId };

  const [product, setProduct] = useState<ProductFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || isNaN(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("ID sản phẩm không hợp lệ");
      setLoading(false);
      return;
    }
    trpc.product.get
      .query({ id }, { context: { headers } })
      .then((p) => {
        if (!p) { setError("Không tìm thấy sản phẩm"); return; }
        const data = p as Record<string, unknown>;
        setProduct({
          name: data.name as string,
          sku: data.sku as string,
          barcode: (data.barcode as string | null) ?? "",
          categoryId: (data.categoryId as number | null) ?? null,
          description: (data.description as string | null) ?? "",
          costPrice: Number(data.costPrice),
          sellingPrice: Number(data.sellingPrice),
          taxRate: Number(data.taxRate ?? 0),
          unit: data.unit as string,
          minStock: Number(data.minStock ?? 0),
          maxStock: data.maxStock != null ? Number(data.maxStock) : null,
          status: data.status as "active" | "inactive" | "discontinued",
          units: ((data.units as unknown[]) ?? []).map((u) => {
            const unit = u as Record<string, unknown>;
            return {
              unitName: unit.unitName as string,
              conversionRate: Number(unit.conversionRate),
              barcode: (unit.barcode as string | null) ?? "",
              sellingPrice: unit.sellingPrice != null ? Number(unit.sellingPrice) : null,
              costPrice: unit.costPrice != null ? Number(unit.costPrice) : null,
              isBase: Boolean(unit.isBase),
            };
          }),
          variants: ((data.variants as unknown[]) ?? []).map((v) => {
            const variant = v as Record<string, unknown>;
            return {
              sku: variant.sku as string,
              barcode: (variant.barcode as string | null) ?? "",
              sellingPrice: Number(variant.sellingPrice),
              costPrice: Number(variant.costPrice),
              attributes: (variant.attributes as { attributeName: string; attributeValue: string }[]) ?? [],
            };
          }),
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(data: ProductFormData) {
    await trpc.product.update.mutate(
      {
        id,
        data: {
          name: data.name,
          categoryId: data.categoryId ?? undefined,
          description: data.description || undefined,
          costPrice: data.costPrice,
          sellingPrice: data.sellingPrice,
          taxRate: data.taxRate,
          unit: data.unit,
          minStock: data.minStock,
          maxStock: data.maxStock ?? undefined,
          status: data.status,
        },
      },
      { context: { headers } },
    );
    router.push("/products");
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/products")}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {loading ? "Đang tải..." : product?.name ?? "Sản phẩm"}
        </h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      ) : product ? (
        <ProductForm
          initialData={product}
          categories={[]}
          isEdit
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}
