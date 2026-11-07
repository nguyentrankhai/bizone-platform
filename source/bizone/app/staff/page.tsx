import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { StaffPageHeader } from "@/components/staff/shared";
import { StaffTable } from "@/components/staff/StaffTable";

export const metadata = { title: "Quản lý nhân viên | BizOne" };

export default function StaffPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <StaffPageHeader
          title="Quản lý nhân viên"
          subtitle="Danh sách nhân viên, phân quyền theo chi nhánh và doanh số tháng"
        />
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <StaffTable auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
