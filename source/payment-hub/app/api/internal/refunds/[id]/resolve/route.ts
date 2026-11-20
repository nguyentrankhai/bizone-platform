import type { NextRequest } from "next/server";
import { handleAdminRefundResolve } from "@/server/routes/refund";
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
      action: "refund.resolve",
      entityType: "refund",
      entityId: id,
      before: () => refundSnapshot(id),
    },
    () => handleAdminRefundResolve(req, id),
  );
}
