import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { ReportsClient } from "@/components/reports/ReportsClient";

export const metadata = { title: "Báo cáo | BizOne" };

export default function ReportsPage() {
  return (
    <AppLayout>
      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Báo cáo &amp; phân tích</h1>
          <p className="mt-1 text-sm text-slate-500">
            Doanh thu, lợi nhuận, hàng bán chạy/chậm, nhân viên, khuyến mãi và tồn kho — lọc theo
            kỳ, chi nhánh, nhân viên, danh mục; so sánh cùng kỳ; xuất PDF/Excel.
          </p>
        </div>
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <ReportsClient auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
