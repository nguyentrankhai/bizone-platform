import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/middleware/adminAuth";
import { isDashboardPeriod } from "@/lib/dashboard";
import { getDashboard } from "@/server/services/dashboard.service";

/**
 * GET /api/internal/dashboard?period=today|7days|30days  (API-Design §6.1, JWT via proxy.ts)
 * Roles payhub-admin | payhub-viewer; a token with merchant_id only sees that merchant.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const period = req.nextUrl.searchParams.get("period") ?? "today";
  if (!isDashboardPeriod(period)) {
    return Response.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "period phải là today | 7days | 30days",
          details: { period: ["Giá trị không hợp lệ"] },
        },
      },
      { status: 400 },
    );
  }

  const data = await getDashboard(period, { merchantId: auth.merchantId });
  return Response.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
