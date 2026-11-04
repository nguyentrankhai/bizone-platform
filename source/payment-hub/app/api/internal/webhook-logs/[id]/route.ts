import type { NextRequest } from "next/server";
import { handleGetWebhookLog } from "@/server/routes/webhook-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleGetWebhookLog(req, (await params).id);
}
