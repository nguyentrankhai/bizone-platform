import type { NextRequest } from "next/server";
import { handleGetPartner, handleUpdatePartner } from "@/server/routes/partners";
import { withAudit } from "@/services/audit/logger";
import { partnerSnapshot } from "@/services/audit/snapshots";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetPartner(req, (await params).id);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "partner.update",
      entityType: "partner_config",
      entityId: id,
      before: () => partnerSnapshot(id),
    },
    () => handleUpdatePartner(req, id),
  );
}
