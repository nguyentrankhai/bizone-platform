import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { StaffPageHeader } from "@/components/staff/shared";
import { CommissionClient } from "@/components/staff/CommissionClient";

export const metadata = { title: "Hoa hồng | BizOne" };

export default function CommissionsPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <StaffPageHeader
          title="Hoa hồng"
          subtitle="Quy tắc hoa hồng, tính tự động sau mỗi hoá đơn và chốt cuối tháng"
        />
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <CommissionClient auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
