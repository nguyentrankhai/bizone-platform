import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { StaffPageHeader } from "@/components/staff/shared";
import { RoleMatrix } from "@/components/staff/RoleMatrix";

export const metadata = { title: "Phân quyền | BizOne" };

export default function RolesPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <StaffPageHeader title="Phân quyền" subtitle="Vai trò và quyền chi tiết theo module" />
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <RoleMatrix auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
