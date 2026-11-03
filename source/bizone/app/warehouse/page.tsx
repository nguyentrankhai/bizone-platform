import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { WarehouseClient } from "@/components/inventory/WarehouseClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Quản lý Kho | BizOne" };

export default function WarehousePage() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý Kho</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tồn kho, phiếu nhập/xuất, lô hàng & hạn sử dụng, danh sách kho
        </p>
      </div>
      {/* useSearchParams (active tab) needs a Suspense boundary under cacheComponents */}
      <Suspense fallback={<p className="text-sm text-gray-400">Đang tải...</p>}>
        <WarehouseClient auth={getDevAuth()} />
      </Suspense>
    </AppLayout>
  );
}
