import type { NextRequest } from "next/server";
import { handleAdminRefund } from "@/server/routes/refund";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(req, { action: "refund.create", entityType: "transaction", entityId: id }, () =>
    handleAdminRefund(req, id),
  );
}
