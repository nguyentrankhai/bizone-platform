import type { NextRequest } from "next/server";
import { handleReplayWebhook } from "@/server/routes/webhook-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleReplayWebhook(req, (await params).id);
}
