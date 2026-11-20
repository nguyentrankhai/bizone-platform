import type { NextRequest } from "next/server";
import { handleGetConnector, handleRemoveConnector } from "@/server/routes/connectors";
import { withAudit } from "@/services/audit/logger";
import { connectorSnapshot } from "@/services/audit/snapshots";

interface Ctx {
  params: Promise<{ code: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetConnector(req, (await params).code);
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { code } = await params;
  return withAudit(
    req,
    {
      action: "connector.remove",
      entityType: "connector",
      entityId: code,
      before: () => connectorSnapshot(code),
    },
    () => handleRemoveConnector(req, code),
  );
}
