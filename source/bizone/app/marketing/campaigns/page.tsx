import { AppLayout } from "@/components/layout/AppLayout";
import { CampaignList } from "@/components/marketing/CampaignList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Chiến dịch SMS / Email | BizOne" };

export default function Page() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <CampaignList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
