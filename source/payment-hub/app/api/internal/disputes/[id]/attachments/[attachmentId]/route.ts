import type { NextRequest } from "next/server";
import { handleDeleteAttachment, handleDownloadAttachment } from "@/server/routes/dispute";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id, attachmentId } = await params;
  return handleDownloadAttachment(req, id, attachmentId);
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id, attachmentId } = await params;
  return handleDeleteAttachment(req, id, attachmentId);
}
