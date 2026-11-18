import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { ReportsClient } from "@/components/ph/ReportsClient";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";
import { REPORT_TYPES, todayVn, type ReportType } from "@/lib/report";
import { reportOptions } from "@/server/services/report.service";

export const instant = false;

/** /reports (P5.5) — data is fetched by the client through /api/internal/reports (role + scope). */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await connection();
  const { tab } = await searchParams;
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const merchantId = session.merchantId;
  const options = await reportOptions(merchantId);
  const canSeeReconciliation = merchantId === undefined;
  const initialTab: ReportType =
    tab &&
    (REPORT_TYPES as readonly string[]).includes(tab) &&
    (tab !== "reconciliation" || canSeeReconciliation)
      ? (tab as ReportType)
      : "transactions";
  return (
    <PHLayout>
      <ReportsClient
        options={options}
        today={todayVn()}
        initialTab={initialTab}
        canSeeReconciliation={canSeeReconciliation}
      />
    </PHLayout>
  );
}
