import { AppLayout } from "@/components/layout/AppLayout";
import { ProductsClient } from "@/components/products/ProductsClient";

export const metadata = { title: "Quản lý Sản phẩm | BizOne" };

export default function ProductsPage() {
  // In production, tenantId and authToken come from session/cookies.
  // For dev, use placeholder values that the middleware/tRPC layer validates.
  const tenantId = process.env.DEV_TENANT_ID ?? "tenant_demo";
  const authToken = process.env.DEV_AUTH_TOKEN ?? "";

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý Sản phẩm</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý danh mục, sản phẩm, đơn vị tính và biến thể
        </p>
      </div>
      <ProductsClient tenantId={tenantId} authToken={authToken} />
    </AppLayout>
  );
}
