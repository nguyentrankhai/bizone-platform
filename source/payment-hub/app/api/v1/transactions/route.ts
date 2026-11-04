import type { NextRequest } from "next/server";
import { handleCreateTransaction, handleListTransactions } from "@/server/routes/transactions";

export async function POST(req: NextRequest): Promise<Response> {
  return handleCreateTransaction(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handleListTransactions(req);
}
