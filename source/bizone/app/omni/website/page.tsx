import { AppLayout } from "@/components/layout/AppLayout";
import { WebsiteChannel } from "@/components/omni/WebsiteChannel";

export const metadata = { title: "Website bán hàng | BizOne" };

export default function OmniWebsitePage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <WebsiteChannel />
      </div>
    </AppLayout>
  );
}
