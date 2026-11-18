import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { DashboardClient } from "@/components/ph/DashboardClient";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";
import { getDashboard } from "@/server/services/dashboard.service";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  // same scope as /api/internal/dashboard: a merchant-bound token only sees its merchant
  const initial = await getDashboard("today", { merchantId: session.merchantId });
  return (
    <PHLayout>
      <DashboardClient initial={initial} wsUrl={process.env.NEXT_PUBLIC_WS_URL ?? ""} />
    </PHLayout>
  );
}
