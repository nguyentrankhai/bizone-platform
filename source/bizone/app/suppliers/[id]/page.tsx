import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Chi tiết nhà cung cấp | BizOne" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <SupplierDetail auth={getDevAuth()} supplierId={id} />
      </div>
    </AppLayout>
  );
}
