import type { NextRequest } from "next/server";
import { handleTxnDisputes } from "@/server/routes/dispute";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleTxnDisputes(req, id);
}
