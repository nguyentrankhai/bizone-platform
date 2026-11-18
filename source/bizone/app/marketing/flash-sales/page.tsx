import { AppLayout } from "@/components/layout/AppLayout";
import { FlashSaleList } from "@/components/marketing/FlashSaleList";

export const metadata = { title: "Flash sale | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <FlashSaleList />
      </div>
    </AppLayout>
  );
}
