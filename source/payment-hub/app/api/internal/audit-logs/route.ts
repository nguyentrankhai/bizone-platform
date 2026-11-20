import type { NextRequest } from "next/server";
import { handleListAudit } from "@/server/routes/audit";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListAudit(req);
}
