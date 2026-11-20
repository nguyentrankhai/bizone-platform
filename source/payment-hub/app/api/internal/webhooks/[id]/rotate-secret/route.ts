import type { NextRequest } from "next/server";
import { handleRotateSecret } from "@/server/routes/webhook-config";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    { action: "webhook.rotate_secret", entityType: "webhook_config", entityId: id },
    () => handleRotateSecret(req, id),
  );
}
