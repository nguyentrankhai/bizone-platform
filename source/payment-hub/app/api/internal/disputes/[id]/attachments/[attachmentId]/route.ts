import type { NextRequest } from "next/server";
import { handleDeleteAttachment, handleDownloadAttachment } from "@/server/routes/dispute";
import { withAudit } from "@/services/audit/logger";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id, attachmentId } = await params;
  return handleDownloadAttachment(req, id, attachmentId);
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id, attachmentId } = await params;
  return withAudit(
    req,
    { action: "dispute.attachment_remove", entityType: "dispute", entityId: id },
    () => handleDeleteAttachment(req, id, attachmentId),
  );
}
