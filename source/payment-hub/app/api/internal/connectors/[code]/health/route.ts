import type { NextRequest } from "next/server";
import { handleConnectorHealth } from "@/server/routes/connectors";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  return withAudit(
    req,
    { action: "connector.health_check", entityType: "connector", entityId: code },
    () => handleConnectorHealth(req, code),
  );
}
