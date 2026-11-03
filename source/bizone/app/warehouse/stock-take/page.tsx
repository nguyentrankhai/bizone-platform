import { AppLayout } from "@/components/layout/AppLayout";
import { StockTakeClient } from "@/components/inventory/StockTakeClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Kiểm kê kho | BizOne" };

export default function StockTakePage() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kiểm kê kho</h1>
        <p className="mt-1 text-sm text-gray-500">
          Đối chiếu tồn kho thực tế với hệ thống, hỗ trợ quét mã vạch
        </p>
      </div>
      <StockTakeClient auth={getDevAuth()} />
    </AppLayout>
  );
}
