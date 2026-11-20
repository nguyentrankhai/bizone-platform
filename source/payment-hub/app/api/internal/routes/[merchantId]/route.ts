import type { NextRequest } from "next/server";
import { handleGetMerchantRoutes, handlePutMerchantRoutes } from "@/server/routes/route-config";
import { withAudit } from "@/services/audit/logger";
import { merchantRoutesSnapshot } from "@/services/audit/snapshots";

type Ctx = { params: Promise<{ merchantId: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetMerchantRoutes(req, (await params).merchantId);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { merchantId } = await params;
  return withAudit(
    req,
    {
      action: "route.update",
      entityType: "merchant_route",
      entityId: merchantId,
      before: () => merchantRoutesSnapshot(merchantId),
    },
    () => handlePutMerchantRoutes(req, merchantId),
  );
}
