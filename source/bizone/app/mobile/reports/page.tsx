import { MobileReports } from "@/components/mobile/MobileReports";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Báo cáo" };

export default function MobileReportsPage() {
  return <MobileReports auth={getDevAuth()} />;
}
