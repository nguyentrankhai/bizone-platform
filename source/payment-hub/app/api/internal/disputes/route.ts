import type { NextRequest } from "next/server";
import { handleCreateDispute, handleListDisputes } from "@/server/routes/dispute";
import { withAudit } from "@/services/audit/logger";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListDisputes(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAudit(
    req,
    {
      action: "dispute.create",
      entityType: "dispute",
      entityIdFrom: (d) => (d as { id?: number } | null)?.id,
    },
    () => handleCreateDispute(req),
  );
}
