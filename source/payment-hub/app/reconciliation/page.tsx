import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { ReconciliationClient } from "@/components/ph/ReconciliationClient";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";
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
  const session = await pageSession({ globalOnly: true });
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
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
        canWrite={session.canWrite}
        partners={partners}
        initialRuns={runs.items}
        initialMeta={runs.meta}
        initialRunId={runId}
        yesterday={vnYesterday()}
      />
    </PHLayout>
  );
}
