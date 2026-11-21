import { guarded } from "@/server/middleware/degrade";
import type { NextRequest } from "next/server";
import { handleGenerateQr } from "@/server/routes/qr";

export async function POST(req: NextRequest): Promise<Response> {
  return guarded(req, "/api/v1/qr/generate", () => handleGenerateQr(req));
}
