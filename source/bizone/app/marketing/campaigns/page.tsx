import { AppLayout } from "@/components/layout/AppLayout";
import { CampaignList } from "@/components/marketing/CampaignList";

export const metadata = { title: "Chiến dịch SMS / Email | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <CampaignList />
      </div>
    </AppLayout>
  );
}
