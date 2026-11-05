import type { NextRequest } from "next/server";
import { handleGetDefaultRoutes } from "@/server/routes/route-config";

export async function GET(req: NextRequest): Promise<Response> {
  return handleGetDefaultRoutes(req);
}
