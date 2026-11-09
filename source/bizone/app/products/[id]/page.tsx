export const instant = false;

import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { ProductDetailClient } from "@/components/products/ProductDetailClient";

export const metadata = { title: "Chi tiết sản phẩm | BizOne" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const auth = getDevAuth();
  return (
    <AppLayout>
      <ProductDetailClient id={id} tenantId={auth.tenantId} authToken={auth.authToken} />
    </AppLayout>
  );
}
