import { AppLayout } from "@/components/layout/AppLayout";
import { CouponList } from "@/components/marketing/CouponList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Mã giảm giá | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <CouponList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
