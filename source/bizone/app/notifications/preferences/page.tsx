import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Tuỳ chọn thông báo | BizOne" };

export default function NotificationPreferencesPage() {
  return (
    <AppLayout>
      <NotificationPreferences auth={getDevAuth()} />
    </AppLayout>
  );
}
