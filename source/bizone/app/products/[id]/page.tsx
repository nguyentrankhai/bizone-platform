export const instant = false;

import { AppLayout } from "@/components/layout/AppLayout";
import { ProductDetailClient } from "@/components/products/ProductDetailClient";

export const metadata = { title: "Chi tiết sản phẩm | BizOne" };

const TENANT_ID = process.env.DEV_TENANT_ID ?? "dev-tenant";
const AUTH_TOKEN = process.env.DEV_AUTH_TOKEN ?? "";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  return (
    <AppLayout>
      <ProductDetailClient id={id} tenantId={TENANT_ID} authToken={AUTH_TOKEN} />
    </AppLayout>
  );
}
