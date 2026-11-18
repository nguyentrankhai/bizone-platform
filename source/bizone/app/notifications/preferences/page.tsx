import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";

export const metadata = { title: "Tuỳ chọn thông báo | BizOne" };

export default function NotificationPreferencesPage() {
  return (
    <AppLayout>
      <NotificationPreferences />
    </AppLayout>
  );
}
