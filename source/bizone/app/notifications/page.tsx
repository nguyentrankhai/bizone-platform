import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export const metadata = { title: "Thông báo | BizOne" };

export default function NotificationsPage() {
  return (
    <AppLayout>
      <NotificationCenter />
    </AppLayout>
  );
}
