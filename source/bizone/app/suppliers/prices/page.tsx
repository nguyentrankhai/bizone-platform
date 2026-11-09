import { AppLayout } from "@/components/layout/AppLayout";
import { PriceComparisonPage } from "@/components/suppliers/PriceComparison";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "So sánh giá nhập | BizOne" };

export default function SupplierPricesPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PriceComparisonPage auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
