import type { NextRequest } from "next/server";
import { handleReplayWebhook } from "@/server/routes/webhook-config";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(req, { action: "webhook.replay", entityType: "webhook_log", entityId: id }, () =>
    handleReplayWebhook(req, id),
  );
}
