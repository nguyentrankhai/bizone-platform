import type { NextRequest } from "next/server";
import { handleAdminRefundOverview } from "@/server/routes/refund";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleAdminRefundOverview(req, id);
}
