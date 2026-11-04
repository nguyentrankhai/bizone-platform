import type { NextRequest } from "next/server";
import { handleWebhookStatus } from "@/server/routes/webhook-config";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleWebhookStatus(req, (await params).id);
}
