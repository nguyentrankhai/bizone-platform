import type { NextRequest } from "next/server";
import { handleCreateRun, handleListRuns } from "@/server/routes/reconciliation";
import { withAudit } from "@/services/audit/logger";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListRuns(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "recon.run",
      entityType: "reconciliation_run",
      entityIdFrom: (d) => (d as { id?: number } | null)?.id,
    },
    () => handleCreateRun(req),
  );
}
