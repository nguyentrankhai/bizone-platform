import { AppLayout } from "@/components/layout/AppLayout";
import { POForm } from "@/components/suppliers/POForm";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Tạo đơn nhập hàng | BizOne" };
// reads ?supplier= — render per request (cacheComponents mode)
export const instant = false;

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const supplier = Number((await searchParams).supplier);
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <POForm
          auth={getDevAuth()}
          initialSupplierId={Number.isSafeInteger(supplier) && supplier > 0 ? supplier : undefined}
        />
      </div>
    </AppLayout>
  );
}
