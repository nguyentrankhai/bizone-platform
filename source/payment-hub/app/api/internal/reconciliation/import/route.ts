import type { NextRequest } from "next/server";
import { handleImport } from "@/server/routes/reconciliation";
import { withAudit } from "@/services/audit/logger";

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "recon.import",
      entityType: "reconciliation_run",
      entityIdFrom: (d) => (d as { id?: number } | null)?.id,
    },
    () => handleImport(req),
  );
}
