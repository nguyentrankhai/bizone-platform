import { MobileNotifications } from "@/components/mobile/MobileNotifications";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Thông báo" };

export default function MobileNotificationsPage() {
  return <MobileNotifications auth={getDevAuth()} />;
}
