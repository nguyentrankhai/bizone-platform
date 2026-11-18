import { MobileDashboard } from "@/components/mobile/MobileDashboard";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Tổng quan" };

export default function MobileDashboardPage() {
  return <MobileDashboard auth={getDevAuth()} />;
}
