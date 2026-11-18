import { AppLayout } from "@/components/layout/AppLayout";
import { TemplateList } from "@/components/notifications/TemplateList";

export const metadata = { title: "Mẫu thông báo | BizOne" };

export default function NotificationTemplatesPage() {
  return (
    <AppLayout>
      <TemplateList />
    </AppLayout>
  );
}
