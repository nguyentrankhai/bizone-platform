import type { NextRequest } from "next/server";
import { handlePingWebhook } from "@/server/routes/webhook-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handlePingWebhook(req, (await params).id);
}
