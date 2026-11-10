import type { NextRequest } from "next/server";
import { handleListDetails } from "@/server/routes/reconciliation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleListDetails(req, id);
}
