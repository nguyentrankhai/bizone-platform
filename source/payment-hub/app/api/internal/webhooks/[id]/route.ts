import type { NextRequest } from "next/server";
import {
  handleDeleteWebhook,
  handleGetWebhook,
  handleUpdateWebhook,
} from "@/server/routes/webhook-config";
import { withAudit } from "@/services/audit/logger";
import { webhookSnapshot } from "@/services/audit/snapshots";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetWebhook(req, (await params).id);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "webhook.update",
      entityType: "webhook_config",
      entityId: id,
      before: () => webhookSnapshot(id),
    },
    () => handleUpdateWebhook(req, id),
  );
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "webhook.delete",
      entityType: "webhook_config",
      entityId: id,
      before: () => webhookSnapshot(id),
    },
    () => handleDeleteWebhook(req, id),
  );
}
