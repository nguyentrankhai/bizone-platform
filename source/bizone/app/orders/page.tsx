import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { OrderTable } from "@/components/orders/OrderTable";

export const metadata = { title: "Đơn hàng | BizOne" };

export default function OrdersPage() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Đơn hàng</h1>
        <p className="mt-1 text-sm text-slate-500">
          Theo dõi toàn bộ đơn hàng từ tất cả kênh, cập nhật trạng thái và xuất báo cáo
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-400">Đang tải...</p>}>
        <OrderTable auth={getDevAuth()} />
      </Suspense>
    </AppLayout>
  );
}
