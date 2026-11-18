import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { MarketplaceChannel } from "@/components/omni/MarketplaceChannel";
import { getDevAuth } from "@/lib/dev-auth";
import { isMarketplace } from "@/lib/omni/marketplace";

export const metadata = { title: "Kênh sàn TMĐT | BizOne" };
// dynamic params access — disable static prerendering (cacheComponents mode)
export const instant = false;

export default async function OmniMarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { channel } = await params;
  if (!isMarketplace(channel)) notFound();
  const sp = await searchParams;
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <MarketplaceChannel
          auth={getDevAuth()}
          code={channel}
          flash={{ connected: sp.connected === "1", error: sp.error?.slice(0, 300) }}
        />
      </div>
    </AppLayout>
  );
}
