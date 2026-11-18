import { Suspense } from "react";
import { MobileOrders } from "@/components/mobile/MobileOrders";
import { Skeleton } from "@/components/mobile/shared";

export const metadata = { title: "Đơn hàng" };

export default function MobileOrdersPage() {
  return (
    // ?status= is read on the client (useSearchParams) — the shell stays static
    <Suspense fallback={<Skeleton rows={5} />}>
      <MobileOrders />
    </Suspense>
  );
}
