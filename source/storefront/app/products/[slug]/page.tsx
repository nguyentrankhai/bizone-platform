import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bizone, StoreApiError } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { PageTitle, Price, ProductImage } from "@/components/ui";
import { AddToCart } from "@/components/AddToCart";

async function load(slug: string) {
  try {
    return await bizone.product(await currentStore(), slug);
  } catch (e) {
    if (e instanceof StoreApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const p = await load((await params).slug);
  return { title: p.name, description: p.description?.slice(0, 160) ?? p.name };
}

/** Chi tiết sản phẩm: giá, tồn kho hiện tại (đọc trực tiếp từ BizOne), phân loại, thêm vào giỏ */
export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const p = await load((await params).slug);
  return (
    <div>
      <PageTitle
        back={{
          href: p.category ? `/?category=${p.category.slug}` : "/",
          label: p.category?.name ?? "Sản phẩm",
        }}
      >
        {p.name}
      </PageTitle>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <ProductImage
            src={p.images[0] ?? null}
            alt={p.name}
            className="aspect-square w-full rounded-xl border border-slate-200"
          />
          {p.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {p.images.slice(1, 6).map((src) => (
                <ProductImage
                  key={src}
                  src={src}
                  alt={p.name}
                  className="aspect-square w-full rounded-lg border border-slate-200"
                />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="text-sm text-slate-500">Mã: {p.sku}</div>
          <Price price={p.price} sale={p.salePrice} className="text-2xl" />
          {p.saleLabel && <div className="text-sm font-medium text-red-600">{p.saleLabel}</div>}
          <AddToCart
            productId={p.id}
            unit={p.unit}
            stock={p.stock}
            variants={p.variants.map((v) => ({
              id: v.id,
              name: v.name,
              price: v.price,
              salePrice: v.salePrice,
              stock: v.stock,
            }))}
          />
          {p.description && (
            <div className="space-y-1 border-t border-slate-200 pt-4">
              <h2 className="font-semibold">Mô tả</h2>
              <p className="text-sm whitespace-pre-line text-slate-700">{p.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
