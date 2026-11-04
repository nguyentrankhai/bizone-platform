import type { NextRequest } from "next/server";
import {
  listTransactions,
  type ListTransactionsInput,
} from "@/server/services/transaction.service";
import type { TxnStatus } from "@/server/services/stateMachine";

function ok(data: unknown): Response {
  return Response.json({ success: true, data });
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);

  const input: ListTransactionsInput = {
    page: parseInt(searchParams.get("page") ?? "1", 10),
    limit: Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100),
    status: (searchParams.get("status") as TxnStatus) || undefined,
    paymentMethod: searchParams.get("payment_method") ?? undefined,
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  };

  const amountMin = searchParams.get("amount_min");
  const amountMax = searchParams.get("amount_max");
  if (amountMin) input.amountMin = parseInt(amountMin, 10);
  if (amountMax) input.amountMax = parseInt(amountMax, 10);

  const result = await listTransactions(input);

  return ok({
    items: result.items.map((t) => ({
      ...t,
      createdAt: (t.createdAt as Date).toISOString(),
      updatedAt: (t.updatedAt as Date).toISOString(),
    })),
    total: result.meta.total,
    page: result.meta.page,
    totalPages: result.meta.totalPages,
  });
}
