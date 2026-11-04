import { router, permissionProcedure } from "@/server/trpc";
import { getDashboardSummary } from "@/server/services/dashboard.service";

export const dashboardRouter = router({
  summary: permissionProcedure("report:read").query(() => getDashboardSummary()),
});
