import type { NextRequest } from "next/server";
import { handleWebhookStats } from "@/server/routes/webhook-config";

export async function GET(req: NextRequest): Promise<Response> {
  return handleWebhookStats(req);
}
