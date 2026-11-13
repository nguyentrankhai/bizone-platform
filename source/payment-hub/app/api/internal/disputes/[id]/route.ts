import type { NextRequest } from "next/server";
import { handleGetDispute, handleUpdateDispute } from "@/server/routes/dispute";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  return handleGetDispute(req, id);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  return handleUpdateDispute(req, id);
}
