import type { NextRequest } from "next/server";
import { handleAdminRefundCheck } from "@/server/routes/refund";
import { withAudit } from "@/services/audit/logger";
import { refundSnapshot } from "@/services/audit/snapshots";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "refund.check",
      entityType: "refund",
      entityId: id,
      before: () => refundSnapshot(id),
    },
    () => handleAdminRefundCheck(req, id),
  );
}
