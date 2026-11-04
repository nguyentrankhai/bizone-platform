import { Suspense } from "react";
import { CustomerDisplay } from "@/components/pos/CustomerDisplay";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Màn hình khách hàng | BizOne" };

type Props = { searchParams: Promise<{ session?: string | string[] }> };

/** Opened by the cashier (F7) on the second monitor: /pos/display?session={id} */
export default function CustomerDisplayPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-screen bg-slate-900" />}>
      <Display searchParams={searchParams} />
    </Suspense>
  );
}

async function Display({ searchParams }: Props) {
  const sessionId = Number((await searchParams).session);
  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-2xl text-slate-300">
        Thiếu mã ca — mở màn hình này từ POS (F7)
      </div>
    );
  }
  return <CustomerDisplay auth={getDevAuth()} sessionId={sessionId} />;
}
