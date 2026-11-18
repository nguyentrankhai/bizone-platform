import { AppLayout } from "@/components/layout/AppLayout";
import { BranchList } from "@/components/branch/BranchList";

export const metadata = { title: "Chi nhánh | BizOne" };

export default function BranchesPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <BranchList />
      </div>
    </AppLayout>
  );
}
