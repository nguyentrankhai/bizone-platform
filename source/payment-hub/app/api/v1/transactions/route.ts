import { guarded } from "@/server/middleware/degrade";
import type { NextRequest } from "next/server";
import { handleCreateTransaction, handleListTransactions } from "@/server/routes/transactions";

export async function POST(req: NextRequest): Promise<Response> {
  return guarded(req, "/api/v1/transactions", () => handleCreateTransaction(req));
}

export async function GET(req: NextRequest): Promise<Response> {
  return guarded(req, "/api/v1/transactions", () => handleListTransactions(req));
}
