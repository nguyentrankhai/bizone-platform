import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { StaffPageHeader } from "@/components/staff/shared";
import { AttendanceClient } from "@/components/staff/AttendanceClient";

export const metadata = { title: "Chấm công | BizOne" };

export default function AttendancePage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <StaffPageHeader
          title="Chấm công"
          subtitle="Check-in/check-out và bảng chấm công theo tuần/tháng"
        />
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <AttendanceClient auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
