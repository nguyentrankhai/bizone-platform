import { AppLayout } from "@/components/layout/AppLayout";
import { SupplierTable } from "@/components/suppliers/SupplierTable";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Nhà cung cấp | BizOne" };

export default function SuppliersPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <SupplierTable auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
