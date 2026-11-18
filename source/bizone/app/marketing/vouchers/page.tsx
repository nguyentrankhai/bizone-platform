import { AppLayout } from "@/components/layout/AppLayout";
import { VoucherList } from "@/components/marketing/VoucherList";

export const metadata = { title: "Voucher | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <VoucherList />
      </div>
    </AppLayout>
  );
}
