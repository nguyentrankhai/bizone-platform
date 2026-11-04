import type { NextRequest } from "next/server";
import { handleTestPartner } from "@/server/routes/partners";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleTestPartner(req, (await params).id);
}
