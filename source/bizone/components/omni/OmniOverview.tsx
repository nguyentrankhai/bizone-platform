"use client";

import { trpc } from "@/lib/trpc";
import { apiContext } from "@/components/inventory/shared";
import { ErrorBox, useLoad } from "@/components/staff/shared";
import { ChannelCard } from "@/components/omni/ChannelCard";
import { SyncHistory } from "@/components/omni/SyncHistory";
import { useApiAuth } from "@/components/auth/AuthProvider";

/** `/omni` — every sales channel at a glance + the combined sync log (P6.2, P6.3) */
export function OmniOverview() {
  const auth = useApiAuth();
  const ch = useLoad("omni-channels", () => trpc.omni.channels.query(undefined, apiContext(auth)));
  const d = ch.data;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Omni Channel</h1>
        <p className="text-sm text-slate-500">
          Kênh bán hàng kết nối với BizOne — sản phẩm, tồn kho và đơn hàng đồng bộ tập trung
        </p>
      </div>
      <ErrorBox message={ch.error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ChannelCard
          code="website"
          name="Website bán hàng"
          detail={d?.website ? d.website.name : "Cửa hàng online [tên].bizone.vn"}
          state={
            !d?.website
              ? "disconnected"
              : d.website.isActive && d.website.hasKey
                ? "connected"
                : "paused"
          }
          lastSyncAt={d?.website?.lastSyncAt ?? null}
          href="/omni/website"
        />
        {(d?.marketplaces ?? []).map((m) => (
          <ChannelCard
            key={m.code}
            code={m.code}
            name={m.name}
            detail={m.shopName ? `Shop: ${m.shopName}` : `Kết nối shop ${m.name} qua OAuth`}
            state={!m.platformConfigured && m.state === "disconnected" ? "not_configured" : m.state}
            lastSyncAt={m.lastSyncAt}
            href={`/omni/${m.code}`}
          />
        ))}
        <ChannelCard
          code="zalo"
          name="Zalo OA / Mini App"
          detail="Chờ tài khoản Zalo OA — link website gắn utm_source=zalo đã được ghi nguồn"
          state="soon"
          lastSyncAt={null}
          href={null}
        />
      </div>
      <SyncHistory auth={auth} />
    </div>
  );
}
