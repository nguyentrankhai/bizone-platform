import { connection } from "next/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { MarketingReport } from "@/components/marketing/MarketingReport";
import { getDevAuth } from "@/lib/dev-auth";
import { vnDateKey } from "@/lib/vn-time";

export const metadata = { title: "Hiệu quả khuyến mãi | BizOne" };
// default range ends today (VN) — render per request, never prerendered (cacheComponents)
export const instant = false;

export default async function Page() {
  await connection();
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <MarketingReport auth={getDevAuth()} today={vnDateKey(new Date())} />
      </div>
    </AppLayout>
  );
}
