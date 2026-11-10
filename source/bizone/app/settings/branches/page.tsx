import { AppLayout } from "@/components/layout/AppLayout";
import { BranchList } from "@/components/branch/BranchList";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Chi nhánh | BizOne" };

export default function BranchesPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <BranchList auth={getDevAuth()} />
      </div>
    </AppLayout>
  );
}
