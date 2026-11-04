import type { NextRequest } from "next/server";
import { handleGetTransaction } from "@/server/routes/transactions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleGetTransaction(req, id);
}
