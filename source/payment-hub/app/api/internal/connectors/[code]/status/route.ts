import type { NextRequest } from "next/server";
import { handleSetConnectorStatus } from "@/server/routes/connectors";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handleSetConnectorStatus(req, (await params).code);
}
