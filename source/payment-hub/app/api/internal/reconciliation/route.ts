import type { NextRequest } from "next/server";
import { handleCreateRun, handleListRuns } from "@/server/routes/reconciliation";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListRuns(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleCreateRun(req);
}
