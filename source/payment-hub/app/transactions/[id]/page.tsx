import { notFound } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";

export const instant = false;
import { PHLayout } from "@/components/ph/PHLayout";
import { getPrisma } from "@/lib/prisma";
import { TransactionDetail, type TxnDetail } from "@/components/ph/TransactionDetail";
import { getTransactionByCode, getTransactionById } from "@/server/services/transaction.service";
import { getRefundOverview } from "@/server/services/refund.service";
import { getTxnDisputeOverview } from "@/server/services/dispute.service";
import { toEligibilityDto } from "@/lib/refund";
import { pageSession } from "@/lib/page-session";
import { SessionGate } from "@/components/auth/AuthProvider";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dispute?: string | string[] }>;
}

/** `merchantId`: a merchant-bound user only sees that merchant's transactions (as the API). */
async function fetchTxn(id: string, merchantId?: number): Promise<TxnDetail | null> {
  let txn;
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) {
    txn = await getTransactionById(numId);
  } else {
    txn = await getTransactionByCode(id);
  }

  if (!txn || (merchantId !== undefined && txn.merchantId !== merchantId)) return null;
  // Names only — never the partner config row itself (it holds encrypted credentials)
  const [merchant, partnerConfig] = await Promise.all([
    getPrisma().merchant.findUnique({
      where: { id: txn.merchantId },
      select: { id: true, code: true, name: true },
    }),
    txn.partnerConfigId
      ? getPrisma().partnerConfig.findUnique({
          where: { id: txn.partnerConfigId },
          select: { name: true, connectorType: true },
        })
      : null,
  ]);

  return {
    ...txn,
    merchant,
    partnerConfig,
    amount: txn.amount.toString(),
    refundedAmount: txn.refundedAmount.toString(),
    expiredAt: txn.expiredAt?.toISOString() ?? null,
    paidAt: txn.paidAt?.toISOString() ?? null,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
    logs: (txn.logs ?? []).map((l) => ({
      ...l,
      id: l.id.toString(),
      createdAt: l.createdAt.toISOString(),
    })),
  } as TxnDetail;
}

export default async function TransactionDetailPage({ params, searchParams }: PageProps) {
  await connection();
  const { id } = await params;
  const { dispute: disputeParam } = await searchParams;
  const session = await pageSession();
  if (!session.ok) {
    return (
      <PHLayout>
        <SessionGate reason={session.reason} message={session.message} />
      </PHLayout>
    );
  }
  const txn = await fetchTxn(id, session.merchantId);
  if (!txn) return notFound();
  const scope = { merchantId: session.merchantId };
  const [overview, disputes] = await Promise.all([
    getRefundOverview(txn.id),
    getTxnDisputeOverview(txn.id, scope),
  ]);
  if (!overview || !disputes) return notFound();
  const openDispute = typeof disputeParam === "string" ? disputeParam.slice(0, 500) : null;

  return (
    <PHLayout>
      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/transactions" className="transition-colors hover:text-blue-600">
          Giao dịch
        </Link>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-gray-700">{txn.txnCode}</span>
      </div>

      <TransactionDetail
        txn={txn}
        refund={{ eligibility: toEligibilityDto(overview.eligibility), refunds: overview.refunds }}
        dispute={disputes}
        openDispute={openDispute === "1" ? "" : openDispute}
        canWrite={session.canWrite}
      />
    </PHLayout>
  );
}
