import { z } from "zod";
import {
  exportReportSchema,
  inventoryReportSchema,
  promotionReportSchema,
  reportFilterSchema,
  type ReportFilter,
} from "@/lib/validators/report";
import { permissionProcedure, router } from "@/server/trpc";
import * as reports from "@/server/services/report.service";
import { enqueueReportExport, exportStatus } from "@/server/queue/reportExport";
import { assertWarehouse, branchFilter, type BranchScope } from "@/server/middleware/branchScope";

/** P4.6: an explicit branch must be allowed; otherwise the branch the user works on */
const scoped = <T extends { branchId?: number }>(input: T, branch: BranchScope): T => ({
  ...input,
  branchId: branchFilter(branch, input.branchId),
});

const report = permissionProcedure("report:read");

export const reportsRouter = router({
  options: report.query(({ ctx }) =>
    reports.reportOptions(ctx.branch.canAll ? undefined : ctx.branch.allowed),
  ),
  revenue: report
    .input(reportFilterSchema)
    .query(({ input, ctx }) => reports.revenueReport(scoped(input, ctx.branch))),
  profit: report
    .input(reportFilterSchema)
    .query(({ input, ctx }) => reports.profitReport(scoped(input, ctx.branch))),
  products: report
    .input(reportFilterSchema)
    .query(({ input, ctx }) => reports.productReport(scoped(input, ctx.branch))),
  staff: report
    .input(reportFilterSchema)
    .query(({ input, ctx }) => reports.staffReport(scoped(input, ctx.branch))),
  /** Tổng hợp theo chi nhánh: mọi chi nhánh người dùng được xem (bỏ qua chi nhánh đang chọn) */
  branches: report
    .input(reportFilterSchema)
    .query(({ input, ctx }) =>
      reports.branchReport(input as ReportFilter, ctx.branch.canAll ? null : ctx.branch.allowed),
    ),
  promotion: report
    .input(promotionReportSchema)
    .query(({ input, ctx }) => reports.promotionReport(scoped(input, ctx.branch))),
  inventory: report.input(inventoryReportSchema).query(async ({ input, ctx }) => {
    if (input.warehouseId) await assertWarehouse(ctx.branch, input.warehouseId);
    return reports.inventoryReport(scoped(input, ctx.branch));
  }),
  /** Async export (worker renders the file) → poll exportStatus with the returned jobId */
  export: report.input(exportReportSchema).mutation(({ ctx, input }) => {
    const f = input.filter as { branchId?: number };
    return enqueueReportExport(
      {
        ...input,
        filter: { ...input.filter, branchId: branchFilter(ctx.branch, f.branchId) },
      } as typeof input,
      ctx.user.username,
    );
  }),
  exportStatus: report
    .input(z.object({ jobId: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => exportStatus(input.jobId, ctx.user.username)),
});
