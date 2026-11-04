import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { CustomerDetail } from "@/components/crm/CustomerDetail";

export const metadata = { title: "Chi tiết khách hàng | BizOne" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const customerId = parseInt(id);

  return (
    <AppLayout>
      <CustomerDetail customerId={customerId} auth={getDevAuth()} />
    </AppLayout>
  );
}
