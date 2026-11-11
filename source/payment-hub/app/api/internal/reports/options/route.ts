import type { NextRequest } from "next/server";
import { handleOptions } from "@/server/routes/reports";

export async function GET(req: NextRequest): Promise<Response> {
  return handleOptions(req);
}
