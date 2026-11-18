import { AppLayout } from "@/components/layout/AppLayout";
import { SupplierTable } from "@/components/suppliers/SupplierTable";

export const metadata = { title: "Nhà cung cấp | BizOne" };

export default function SuppliersPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <SupplierTable />
      </div>
    </AppLayout>
  );
}
