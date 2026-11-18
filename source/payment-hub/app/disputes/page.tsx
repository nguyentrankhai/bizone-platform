import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { DisputesClient } from "@/components/ph/DisputesClient";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";
import { DISPUTE_STATUSES, type DisputeStatus } from "@/lib/dispute";
import { listDisputes } from "@/server/services/dispute.service";

export const instant = false;

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  const { status: raw } = await searchParams;
  const status =
    raw === "all"
      ? ""
      : raw && (DISPUTE_STATUSES as readonly string[]).includes(raw)
        ? (raw as DisputeStatus)
        : "open";
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const result = await listDisputes(
    { status: status || undefined, page: 1, limit: 20 },
    { merchantId: session.merchantId },
  );
  return (
    <PHLayout>
      <DisputesClient
        initialItems={result.items}
        initialMeta={{ ...result.meta, counts: result.counts }}
        initialStatus={status}
      />
    </PHLayout>
  );
}
