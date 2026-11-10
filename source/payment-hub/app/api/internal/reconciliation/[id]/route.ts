import type { NextRequest } from "next/server";
import { handleGetRun } from "@/server/routes/reconciliation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleGetRun(req, id);
}
