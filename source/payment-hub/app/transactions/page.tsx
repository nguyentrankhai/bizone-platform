import { connection } from "next/server";
import { PHLayout } from "@/components/ph/PHLayout";

export const instant = false;
import { TransactionsClient } from "@/components/ph/TransactionsClient";
import { listTransactions } from "@/server/services/transaction.service";
import { getDevAuthToken } from "@/lib/dev-auth";

export default async function TransactionsPage() {
  await connection();
  const result = await listTransactions({ page: 1, limit: 20 });

  const initialData = {
    items: result.items.map((t) => ({
      ...t,
      amount: t.amount.toString(),
      refundedAmount: t.refundedAmount.toString(),
      createdAt: (t.createdAt as Date).toISOString(),
      updatedAt: (t.updatedAt as Date).toISOString(),
    })),
    total: result.meta.total,
    page: result.meta.page,
    totalPages: result.meta.totalPages,
  };

  return (
    <PHLayout>
      <TransactionsClient initialData={initialData} authToken={getDevAuthToken()} />
    </PHLayout>
  );
}
