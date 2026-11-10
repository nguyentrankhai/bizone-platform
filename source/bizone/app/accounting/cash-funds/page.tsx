import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CashFundsClient } from "@/components/accounting/CashFundsClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Quỹ & sổ quỹ | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        {/* Client components read the current VN date → render at request time */}
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <CashFundsClient auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
