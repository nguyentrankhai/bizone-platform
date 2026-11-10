import type { NextRequest } from "next/server";
import { handleImport } from "@/server/routes/reconciliation";

export async function POST(req: NextRequest): Promise<Response> {
  return handleImport(req);
}
