import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { DisputesClient } from "@/components/ph/DisputesClient";
import { devTokenMerchantId, getDevAuthToken } from "@/lib/dev-auth";
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
  const token = getDevAuthToken();
  const result = await listDisputes(
    { status: status || undefined, page: 1, limit: 20 },
    { merchantId: devTokenMerchantId(token) },
  );
  return (
    <PHLayout>
      <DisputesClient
        authToken={token}
        initialItems={result.items}
        initialMeta={{ ...result.meta, counts: result.counts }}
        initialStatus={status}
      />
    </PHLayout>
  );
}
