import { AppLayout } from "@/components/layout/AppLayout";
import { WebsiteChannel } from "@/components/omni/WebsiteChannel";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Omni Channel | BizOne" };

export default function OmniPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <WebsiteChannel auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
