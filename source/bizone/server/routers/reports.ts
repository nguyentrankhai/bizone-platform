import { z } from "zod";
import {
  exportReportSchema,
  inventoryReportSchema,
  promotionReportSchema,
  reportFilterSchema,
} from "@/lib/validators/report";
import { permissionProcedure, router } from "@/server/trpc";
import * as reports from "@/server/services/report.service";
import { enqueueReportExport, exportStatus } from "@/server/queue/reportExport";

export const reportsRouter = router({
  options: permissionProcedure("report:read").query(() => reports.reportOptions()),
  revenue: permissionProcedure("report:read")
    .input(reportFilterSchema)
    .query(({ input }) => reports.revenueReport(input)),
  profit: permissionProcedure("report:read")
    .input(reportFilterSchema)
    .query(({ input }) => reports.profitReport(input)),
  products: permissionProcedure("report:read")
    .input(reportFilterSchema)
    .query(({ input }) => reports.productReport(input)),
  staff: permissionProcedure("report:read")
    .input(reportFilterSchema)
    .query(({ input }) => reports.staffReport(input)),
  promotion: permissionProcedure("report:read")
    .input(promotionReportSchema)
    .query(({ input }) => reports.promotionReport(input)),
  inventory: permissionProcedure("report:read")
    .input(inventoryReportSchema)
    .query(({ input }) => reports.inventoryReport(input)),
  /** Async export (worker renders the file) → poll exportStatus with the returned jobId */
  export: permissionProcedure("report:read")
    .input(exportReportSchema)
    .mutation(({ ctx, input }) => enqueueReportExport(input, ctx.user.username)),
  exportStatus: permissionProcedure("report:read")
    .input(z.object({ jobId: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => exportStatus(input.jobId, ctx.user.username)),
});
