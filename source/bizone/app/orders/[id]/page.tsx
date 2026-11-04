import { AppLayout } from "@/components/layout/AppLayout";
import { getDevAuth } from "@/lib/dev-auth";
import { OrderDetail } from "@/components/orders/OrderDetail";

export const metadata = { title: "Chi tiết đơn hàng | BizOne" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const orderId = parseInt(id);

  return (
    <AppLayout>
      <OrderDetail orderId={orderId} auth={getDevAuth()} />
    </AppLayout>
  );
}
