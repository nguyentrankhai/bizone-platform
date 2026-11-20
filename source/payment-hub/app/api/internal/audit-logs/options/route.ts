import type { NextRequest } from "next/server";
import { handleAuditOptions } from "@/server/routes/audit";

export async function GET(req: NextRequest): Promise<Response> {
  return handleAuditOptions(req);
}
