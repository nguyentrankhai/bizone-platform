import type { NextRequest } from "next/server";
import { handlePartners } from "@/server/routes/reconciliation";

export async function GET(req: NextRequest): Promise<Response> {
  return handlePartners(req);
}
