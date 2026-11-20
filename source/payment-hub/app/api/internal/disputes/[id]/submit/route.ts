import type { NextRequest } from "next/server";
import { handleSubmitDispute } from "@/server/routes/dispute";
import { withAudit } from "@/services/audit/logger";
import { disputeSnapshot } from "@/services/audit/snapshots";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    {
      action: "dispute.submit",
      entityType: "dispute",
      entityId: id,
      before: () => disputeSnapshot(id),
    },
    () => handleSubmitDispute(req, id),
  );
}
