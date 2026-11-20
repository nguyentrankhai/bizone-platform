import type { NextRequest } from "next/server";
import { handleExportAudit } from "@/server/routes/audit";

export async function GET(req: NextRequest): Promise<Response> {
  return handleExportAudit(req);
}
