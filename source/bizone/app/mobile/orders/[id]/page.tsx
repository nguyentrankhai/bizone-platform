import { notFound } from "next/navigation";
import { MobileOrderDetail } from "@/components/mobile/MobileOrderDetail";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Chi tiết đơn hàng" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

export default async function MobileOrderPage({ params }: PageProps<"/mobile/orders/[id]">) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  return <MobileOrderDetail auth={getDevAuth()} orderId={orderId} />;
}
