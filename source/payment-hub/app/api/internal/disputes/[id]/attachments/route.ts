import type { NextRequest } from "next/server";
import { handleUploadAttachment } from "@/server/routes/dispute";
import { withAudit } from "@/services/audit/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withAudit(
    req,
    { action: "dispute.attachment_add", entityType: "dispute", entityId: id },
    () => handleUploadAttachment(req, id),
  );
}
