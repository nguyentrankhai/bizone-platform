import { AppLayout } from "@/components/layout/AppLayout";
import { PromotionList } from "@/components/marketing/PromotionList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Mua X tặng Y & Combo | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PromotionList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
