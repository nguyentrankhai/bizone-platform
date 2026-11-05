import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { DashboardClient } from "@/components/ph/DashboardClient";
import { getDevAuthToken } from "@/lib/dev-auth";
import { getDashboard } from "@/server/services/dashboard.service";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  // Page-level data is not scoped by token yet (same as /transactions, /webhooks — issue #7);
  // client re-fetches go through /api/internal/dashboard, which enforces role + merchant scope.
  const initial = await getDashboard("today", {});
  return (
    <PHLayout>
      <DashboardClient
        initial={initial}
        authToken={getDevAuthToken()}
        wsUrl={process.env.NEXT_PUBLIC_WS_URL ?? ""}
      />
    </PHLayout>
  );
}
