import type { NextRequest } from "next/server";
import { handleResetCircuit } from "@/server/routes/route-config";
import { withAudit } from "@/services/audit/logger";

type Ctx = { params: Promise<{ partnerId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { partnerId } = await params;
  return withAudit(
    req,
    { action: "route.reset_circuit", entityType: "partner_config", entityId: partnerId },
    () => handleResetCircuit(req, partnerId),
  );
}
