import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { ReconciliationClient } from "@/components/ph/ReconciliationClient";
import { devTokenCanWrite, getDevAuthToken } from "@/lib/dev-auth";
import {
  getRun,
  listRuns,
  reconcilablePartners,
  vnYesterday,
} from "@/server/services/reconciliation.service";

export const instant = false;

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await connection();
  const { run } = await searchParams;
  const token = getDevAuthToken();
  const [partners, runs] = await Promise.all([
    reconcilablePartners(),
    listRuns({ page: 1, limit: 15 }),
  ]);
  const runId = run && /^\d+$/.test(run) ? Number(run) : null;
  // A run linked from the dashboard may be older than the first page
  if (runId && !runs.items.some((r) => r.id === runId)) {
    const extra = await getRun(runId).catch(() => null);
    if (extra) runs.items.unshift(extra);
  }
  return (
    <PHLayout>
      <ReconciliationClient
        authToken={token}
        canWrite={devTokenCanWrite(token)}
        partners={partners}
        initialRuns={runs.items}
        initialMeta={runs.meta}
        initialRunId={runId}
        yesterday={vnYesterday()}
      />
    </PHLayout>
  );
}
