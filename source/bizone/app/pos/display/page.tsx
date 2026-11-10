import { Suspense } from "react";
import { CustomerDisplay } from "@/components/pos/CustomerDisplay";
import { PairingScreen } from "@/components/pos/PairingScreen";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Màn hình khách hàng | BizOne" };

type Props = { searchParams: Promise<{ session?: string | string[] }> };

/**
 * Customer display. `/pos/display?session={id}`: opened by the cashier (F7) on a second monitor of
 * the same machine. `/pos/display` alone: a separate device pairs with a shift by PIN (P4.5).
 */
export default function CustomerDisplayPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-screen bg-slate-900" />}>
      <Display searchParams={searchParams} />
    </Suspense>
  );
}

async function Display({ searchParams }: Props) {
  const sessionId = Number((await searchParams).session);
  if (!sessionId) return <PairingScreen />;
  return <CustomerDisplay auth={getDevAuth()} sessionId={sessionId} />;
}
