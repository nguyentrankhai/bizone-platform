import type { NextRequest } from "next/server";
import { handleCreateWebhook, handleListWebhooks } from "@/server/routes/webhook-config";
import { withAudit } from "@/services/audit/logger";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListWebhooks(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "webhook.create",
      entityType: "webhook_config",
      entityIdFrom: (d) => (d as { id?: number } | null)?.id,
    },
    () => handleCreateWebhook(req),
  );
}
