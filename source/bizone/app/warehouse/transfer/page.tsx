import { AppLayout } from "@/components/layout/AppLayout";
import { TransferClient } from "@/components/inventory/TransferClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Chuyển kho | BizOne" };

export default function TransferPage() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Chuyển kho</h1>
        <p className="mt-1 text-sm text-gray-500">Chuyển hàng giữa các kho theo 3 bước</p>
      </div>
      <TransferClient auth={getDevAuth()} />
    </AppLayout>
  );
}
