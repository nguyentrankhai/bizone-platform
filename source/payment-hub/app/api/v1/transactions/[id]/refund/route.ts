import { guarded } from "@/server/middleware/degrade";
import type { NextRequest } from "next/server";
import { handleMerchantRefund } from "@/server/routes/refund";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return guarded(req, "/api/v1/transactions/[id]/refund", () => handleMerchantRefund(req, id));
}
