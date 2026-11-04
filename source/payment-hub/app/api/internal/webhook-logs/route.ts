import type { NextRequest } from "next/server";
import { handleListWebhookLogs } from "@/server/routes/webhook-config";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListWebhookLogs(req);
}
