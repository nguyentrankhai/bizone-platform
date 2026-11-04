import type { NextRequest } from "next/server";
import { handleSetPartnerStatus } from "@/server/routes/partners";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleSetPartnerStatus(req, (await params).id);
}
