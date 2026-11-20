import type { NextRequest } from "next/server";
import { handleTestPartner } from "@/server/routes/partners";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    { action: "partner.test", entityType: "partner_config", entityId: id },
    () => handleTestPartner(req, id),
  );
}
