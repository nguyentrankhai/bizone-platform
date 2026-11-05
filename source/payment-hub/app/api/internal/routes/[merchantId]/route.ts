import type { NextRequest } from "next/server";
import { handleGetMerchantRoutes, handlePutMerchantRoutes } from "@/server/routes/route-config";

type Ctx = { params: Promise<{ merchantId: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetMerchantRoutes(req, (await params).merchantId);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handlePutMerchantRoutes(req, (await params).merchantId);
}
