import type { NextRequest } from "next/server";
import { handleUpdateDetail } from "@/server/routes/reconciliation";
import { withAudit } from "@/services/audit/logger";
import { reconDetailSnapshot } from "@/services/audit/snapshots";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> },
): Promise<Response> {
  const { id, detailId } = await params;
  return withAudit(
    req,
    {
      action: "recon.resolve_detail",
      entityType: "reconciliation_detail",
      entityId: detailId,
      before: () => reconDetailSnapshot(detailId),
    },
    () => handleUpdateDetail(req, id, detailId),
  );
}
