import type { NextRequest } from "next/server";
import { getTransactionById, getTransactionByCode } from "@/server/services/transaction.service";
import { requireAdmin } from "@/server/middleware/adminAuth";

function ok(data: unknown): Response {
  return Response.json({ success: true, data });
}

function notFound(): Response {
  return Response.json(
    { success: false, error: { code: "NOT_FOUND", message: "Transaction not found" } },
    { status: 404 },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  let txn;
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) {
    txn = await getTransactionById(numId, auth.merchantId);
  } else {
    txn = await getTransactionByCode(id, auth.merchantId);
  }

  if (!txn) return notFound();

  return ok({
    ...txn,
    amount: txn.amount.toString(),
    refundedAmount: txn.refundedAmount.toString(),
    logs: txn.logs?.map((l) => ({ ...l, id: l.id.toString() })),
  });
}
