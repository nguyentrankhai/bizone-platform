import { AppLayout } from "@/components/layout/AppLayout";
import { OmniOverview } from "@/components/omni/OmniOverview";

export const metadata = { title: "Omni Channel | BizOne" };

export default function OmniPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <OmniOverview />
      </div>
    </AppLayout>
  );
}
