import type { NextRequest } from "next/server";
import { handleResetCircuit } from "@/server/routes/route-config";

type Ctx = { params: Promise<{ partnerId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleResetCircuit(req, (await params).partnerId);
}
