import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { getDashboardSummary, getDayDetail } from "@/server/services/dashboard.service";

export const dashboardRouter = router({
  summary: permissionProcedure("report:read").query(({ ctx }) =>
    getDashboardSummary(ctx.branch.current ?? undefined),
  ),

  /** Drill-down từ biểu đồ doanh thu: chi tiết một ngày (YYYY-MM-DD, giờ VN) */
  dayDetail: permissionProcedure("report:read")
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD") }))
    .query(({ input, ctx }) => getDayDetail(input.date, ctx.branch.current ?? undefined)),
});
