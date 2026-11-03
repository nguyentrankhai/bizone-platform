import { AppLayout } from "@/components/layout/AppLayout";
import { NewProductClient } from "@/components/products/NewProductClient";

export const metadata = { title: "Thêm sản phẩm | BizOne" };

const TENANT_ID = process.env.DEV_TENANT_ID ?? "dev-tenant";
const AUTH_TOKEN = process.env.DEV_AUTH_TOKEN ?? "";

export default function NewProductPage() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Thêm sản phẩm mới</h1>
      </div>
      <NewProductClient tenantId={TENANT_ID} authToken={AUTH_TOKEN} />
    </AppLayout>
  );
}
