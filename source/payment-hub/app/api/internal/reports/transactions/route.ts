import type { NextRequest } from "next/server";
import { handleTransactions } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleTransactions(req);
}
