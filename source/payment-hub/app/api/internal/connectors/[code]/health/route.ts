import type { NextRequest } from "next/server";
import { handleConnectorHealth } from "@/server/routes/connectors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handleConnectorHealth(req, (await params).code);
}
