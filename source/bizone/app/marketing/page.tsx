import { AppLayout } from "@/components/layout/AppLayout";
import { CouponList } from "@/components/marketing/CouponList";

export const metadata = { title: "Mã giảm giá | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <CouponList />
      </div>
    </AppLayout>
  );
}
