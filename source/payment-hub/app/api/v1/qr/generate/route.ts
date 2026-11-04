import type { NextRequest } from "next/server";
import { handleGenerateQr } from "@/server/routes/qr";

export async function POST(req: NextRequest): Promise<Response> {
  return handleGenerateQr(req);
}
