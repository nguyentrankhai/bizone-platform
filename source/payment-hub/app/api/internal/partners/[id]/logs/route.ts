import type { NextRequest } from "next/server";
import { handleListPartnerLogs } from "@/server/routes/partners";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleListPartnerLogs(req, (await params).id);
}
