import type { NextRequest } from "next/server";
import { handleGetQr } from "@/server/routes/qr";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ transaction_id: string }> },
): Promise<Response> {
  const { transaction_id } = await params;
  return handleGetQr(req, transaction_id);
}
