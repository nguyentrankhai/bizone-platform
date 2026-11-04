import type { NextRequest } from "next/server";
import { handleCreatePartner, handleListPartners } from "@/server/routes/partners";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListPartners(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleCreatePartner(req);
}
