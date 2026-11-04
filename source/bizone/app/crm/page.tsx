import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { CustomerTable } from "@/components/crm/CustomerTable";

export const metadata = { title: "CRM Khách hàng | BizOne" };

export default function CrmPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}>
        <CustomerTable auth={getDevAuth()} />
      </Suspense>
    </AppLayout>
  );
}
