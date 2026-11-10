import { AppLayout } from "@/components/layout/AppLayout";
import { DeliveryLog } from "@/components/notifications/DeliveryLog";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Lịch sử gửi thông báo | BizOne" };

export default function NotificationDeliveriesPage() {
  return (
    <AppLayout>
      <DeliveryLog auth={getDevAuth()} />
    </AppLayout>
  );
}
