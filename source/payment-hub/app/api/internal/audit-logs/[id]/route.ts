import type { NextRequest } from "next/server";
import { handleGetAudit } from "@/server/routes/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleGetAudit(req, (await params).id);
}
