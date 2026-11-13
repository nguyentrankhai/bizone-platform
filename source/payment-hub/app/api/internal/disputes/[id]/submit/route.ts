import type { NextRequest } from "next/server";
import { handleSubmitDispute } from "@/server/routes/dispute";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleSubmitDispute(req, id);
}
