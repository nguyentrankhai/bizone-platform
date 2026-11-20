import type { NextRequest } from "next/server";
import { handleListConnectors, handleUploadConnector } from "@/server/routes/connectors";
import { withAudit } from "@/services/audit/logger";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListConnectors(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "connector.upload",
      entityType: "connector",
      entityIdFrom: (d) => (d as { connector?: { code?: string } } | null)?.connector?.code,
    },
    () => handleUploadConnector(req),
  );
}
