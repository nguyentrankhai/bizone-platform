import type { NextRequest } from "next/server";
import { handleWebhookStatus } from "@/server/routes/webhook-config";
import { withAudit } from "@/services/audit/logger";
import { webhookSnapshot } from "@/services/audit/snapshots";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "webhook.status",
      entityType: "webhook_config",
      entityId: id,
      before: () => webhookSnapshot(id),
    },
    () => handleWebhookStatus(req, id),
  );
}
