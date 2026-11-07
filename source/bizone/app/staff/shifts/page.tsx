import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { StaffPageHeader } from "@/components/staff/shared";
import { ShiftCalendar } from "@/components/staff/ShiftCalendar";

export const metadata = { title: "Ca làm việc | BizOne" };

export default function ShiftsPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <StaffPageHeader title="Ca làm việc" subtitle="Tạo ca và xếp lịch theo tuần" />
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <ShiftCalendar auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
