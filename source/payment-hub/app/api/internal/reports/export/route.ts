import type { NextRequest } from "next/server";
import { handleExport } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleExport(req);
}
