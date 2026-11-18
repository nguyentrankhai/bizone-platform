import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

export const metadata = { title: "Cấu hình thông báo | BizOne" };

export default function NotificationSettingsPage() {
  return (
    <AppLayout>
      <NotificationSettings />
    </AppLayout>
  );
}
