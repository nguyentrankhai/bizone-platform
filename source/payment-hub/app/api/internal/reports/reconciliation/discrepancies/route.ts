import type { NextRequest } from "next/server";
import { handleDiscrepancies } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleDiscrepancies(req);
}
