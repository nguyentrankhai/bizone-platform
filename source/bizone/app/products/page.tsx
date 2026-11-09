import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { ProductsClient } from "@/components/products/ProductsClient";

export const metadata = { title: "Quản lý Sản phẩm | BizOne" };

export default function ProductsPage() {
  const { tenantId, authToken } = getDevAuth();

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
