import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Thông báo | BizOne" };

export default function NotificationsPage() {
  return (
    <AppLayout>
      <NotificationCenter auth={getDevAuth()} />
    </AppLayout>
  );
}
