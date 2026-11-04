import type { NextRequest } from "next/server";
import { handleRotateSecret } from "@/server/routes/webhook-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRotateSecret(req, (await params).id);
}
