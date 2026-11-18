import { AppLayout } from "@/components/layout/AppLayout";
import { DeliveryLog } from "@/components/notifications/DeliveryLog";

export const metadata = { title: "Lịch sử gửi thông báo | BizOne" };

export default function NotificationDeliveriesPage() {
  return (
    <AppLayout>
      <DeliveryLog />
    </AppLayout>
  );
}
