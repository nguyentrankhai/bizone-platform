import type { NextRequest } from "next/server";
import { handleUpdateDetail } from "@/server/routes/reconciliation";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> },
): Promise<Response> {
  const { id, detailId } = await params;
  return handleUpdateDetail(req, id, detailId);
}
