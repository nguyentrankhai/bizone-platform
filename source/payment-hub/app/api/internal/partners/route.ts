import type { NextRequest } from "next/server";
import { handleCreatePartner, handleListPartners } from "@/server/routes/partners";
import { withAudit } from "@/services/audit/logger";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListPartners(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "partner.create",
      entityType: "partner_config",
      entityIdFrom: (d) => (d as { id?: number } | null)?.id,
    },
    () => handleCreatePartner(req),
  );
}
