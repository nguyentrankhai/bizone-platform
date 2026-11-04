import type { NextRequest } from "next/server";
import {
  listTransactions,
  type ListTransactionsInput,
} from "@/server/services/transaction.service";
import { isTxnStatus } from "@/server/services/stateMachine";
import { requireAdmin } from "@/server/middleware/adminAuth";

function positiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

function ok(data: unknown): Response {
  return Response.json({ success: true, data });
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const input: ListTransactionsInput = {
    page: positiveInt(searchParams.get("page"), 1),
    limit: Math.min(positiveInt(searchParams.get("limit"), 20), 100),
    status: status && isTxnStatus(status) ? status : undefined,
    paymentMethod: searchParams.get("payment_method") ?? undefined,
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    // Merchant-bound tokens only ever see their own merchant's transactions.
    merchantId: auth.merchantId,
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
