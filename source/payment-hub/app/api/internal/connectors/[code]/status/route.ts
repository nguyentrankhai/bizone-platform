import type { NextRequest } from "next/server";
import { handleSetConnectorStatus } from "@/server/routes/connectors";
import { withAudit } from "@/services/audit/logger";
import { connectorSnapshot } from "@/services/audit/snapshots";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  return withAudit(
    req,
    {
      action: "connector.status",
      entityType: "connector",
      entityId: code,
      before: () => connectorSnapshot(code),
    },
    () => handleSetConnectorStatus(req, code),
  );
}
