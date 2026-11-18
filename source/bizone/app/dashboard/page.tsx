import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard | BizOne" };

export default function DashboardPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
      >
        <DashboardClient />
      </Suspense>
    </AppLayout>
  );
}
