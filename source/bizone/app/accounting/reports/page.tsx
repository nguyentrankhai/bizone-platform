import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { FinanceReports } from "@/components/accounting/FinanceReports";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Lời lỗ & dòng tiền | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        {/* Client components read the current VN date → render at request time */}
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <FinanceReports auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
