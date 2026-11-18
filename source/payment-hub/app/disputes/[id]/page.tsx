import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";
import { DisputeDetailClient } from "@/components/ph/DisputeDetailClient";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";
import { DisputeError, getDispute, getTxnDisputeOverview } from "@/server/services/dispute.service";

export const instant = false;

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return notFound();
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const scope = { merchantId: session.merchantId };
  const dispute = await getDispute(Number(id), scope).catch((e: unknown) => {
    if (e instanceof DisputeError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!dispute) return notFound();
  const overview = await getTxnDisputeOverview(dispute.transactionId, scope);
  if (!overview) return notFound();

  return (
    <PHLayout>
      <div className="mb-5 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/disputes" className="transition-colors hover:text-blue-600">
          Tra soát
        </Link>
        <span>/</span>
        <span className="font-mono text-gray-700">{dispute.disputeCode}</span>
      </div>
      <DisputeDetailClient
        dispute={dispute}
        submitOptions={overview.submit}
        canWrite={session.canWrite}
      />
    </PHLayout>
  );
}
