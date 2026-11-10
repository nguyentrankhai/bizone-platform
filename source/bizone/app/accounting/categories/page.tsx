import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CategoryManager } from "@/components/accounting/CategoryManager";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Danh mục thu chi | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        {/* Client components read the current VN date → render at request time */}
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <CategoryManager auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
