export const instant = false;

import { AppLayout } from "@/components/layout/AppLayout";
import { ProductDetailClient } from "@/components/products/ProductDetailClient";

export const metadata = { title: "Chi tiết sản phẩm | BizOne" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  return (
    <AppLayout>
      <ProductDetailClient id={id} />
    </AppLayout>
  );
}
