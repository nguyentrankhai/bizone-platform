import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { AuditTable } from "@/components/audit/AuditTable";

export const metadata = { title: "Audit Log | BizOne" };

export default function AuditLogPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lịch sử thao tác hệ thống — append-only, lưu 90 ngày. Không thể xoá hoặc sửa.
          </p>
        </div>
        <Suspense
          fallback={<div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>}
        >
          <AuditTable auth={getDevAuth()} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
