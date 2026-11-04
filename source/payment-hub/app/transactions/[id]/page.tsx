import { notFound } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";

export const instant = false;
import { PHLayout } from "@/components/ph/PHLayout";
import { TransactionDetail, type TxnDetail } from "@/components/ph/TransactionDetail";
import { getTransactionByCode, getTransactionById } from "@/server/services/transaction.service";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchTxn(id: string): Promise<TxnDetail | null> {
  let txn;
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) {
    txn = await getTransactionById(numId);
  } else {
    txn = await getTransactionByCode(id);
  }

  if (!txn) return null;

  return {
    ...txn,
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

export default async function TransactionDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const txn = await fetchTxn(id);

  if (!txn) return notFound();

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

      <TransactionDetail txn={txn} />
    </PHLayout>
  );
}
