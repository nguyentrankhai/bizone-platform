import type { NextRequest } from "next/server";
import { handleCreateDispute, handleListDisputes } from "@/server/routes/dispute";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListDisputes(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleCreateDispute(req);
}
