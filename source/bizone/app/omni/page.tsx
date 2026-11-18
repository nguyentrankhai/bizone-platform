import { AppLayout } from "@/components/layout/AppLayout";
import { OmniOverview } from "@/components/omni/OmniOverview";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Omni Channel | BizOne" };

export default function OmniPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <OmniOverview auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
