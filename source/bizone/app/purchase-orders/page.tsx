import { AppLayout } from "@/components/layout/AppLayout";
import { PurchaseOrderList } from "@/components/suppliers/PurchaseOrderList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Đơn nhập hàng | BizOne" };

export default function PurchaseOrdersPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PurchaseOrderList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
