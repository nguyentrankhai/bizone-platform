import type { NextRequest } from "next/server";
import { handleReconciliation } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleReconciliation(req);
}
