import type { NextRequest } from "next/server";
import { handleRevenue } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleRevenue(req);
}
