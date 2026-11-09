import { AppLayout } from "@/components/layout/AppLayout";
import { FlashSaleList } from "@/components/marketing/FlashSaleList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Flash sale | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <FlashSaleList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
