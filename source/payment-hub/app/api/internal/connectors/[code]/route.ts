import type { NextRequest } from "next/server";
import { handleGetConnector, handleRemoveConnector } from "@/server/routes/connectors";

interface Ctx {
  params: Promise<{ code: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetConnector(req, (await params).code);
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleRemoveConnector(req, (await params).code);
}
