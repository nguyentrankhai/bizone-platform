import type { NextRequest } from "next/server";
import { handleGetByMerchantTxnId } from "@/server/routes/transactions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ merchant_txn_id: string }> },
): Promise<Response> {
  const { merchant_txn_id } = await params;
  return handleGetByMerchantTxnId(req, merchant_txn_id);
}
