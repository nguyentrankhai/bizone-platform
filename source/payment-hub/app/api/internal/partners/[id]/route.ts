import type { NextRequest } from "next/server";
import { handleGetPartner, handleUpdatePartner } from "@/server/routes/partners";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetPartner(req, (await params).id);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleUpdatePartner(req, (await params).id);
}
