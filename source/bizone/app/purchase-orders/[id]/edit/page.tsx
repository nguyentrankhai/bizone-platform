import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { POEditLoader } from "@/components/suppliers/POForm";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Sửa đơn nhập | BizOne" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <POEditLoader auth={getDevAuth()} poId={id} />
      </div>
    </AppLayout>
  );
}
