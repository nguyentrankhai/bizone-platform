import type { NextRequest } from "next/server";
import { handleSetPartnerStatus } from "@/server/routes/partners";
import { withAudit } from "@/services/audit/logger";
import { partnerSnapshot } from "@/services/audit/snapshots";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "partner.status",
      entityType: "partner_config",
      entityId: id,
      before: () => partnerSnapshot(id),
    },
    () => handleSetPartnerStatus(req, id),
  );
}
