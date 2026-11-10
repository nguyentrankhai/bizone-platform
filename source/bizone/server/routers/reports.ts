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
import { enqueueReportEmail } from "@/server/queue/notification";
import { emailListSchema } from "@/lib/validators/notification";
import { bizoneError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { getStaffAccess } from "@/server/services/rbac.service";
import type { AuthUser } from "@/types/auth";
import { assertWarehouse, branchFilter, type BranchScope } from "@/server/middleware/branchScope";

/** P4.6: an explicit branch must be allowed; otherwise the branch the user works on */
const scoped = <T extends { branchId?: number }>(input: T, branch: BranchScope): T => ({
  ...input,
  branchId: branchFilter(branch, input.branchId),
});

const report = permissionProcedure("report:read");

/**
 * QA-3 (#99): any address only for users who manage the store (`config:read` — admin, manager);
 * report viewers may mail reports to staff accounts only, not to arbitrary outside addresses.
 */
async function assertRecipients(user: AuthUser, to: string[]) {
  const access = await getStaffAccess(user);
  if (hasPermission(user, "config:read", access.capabilities)) return;
  const staff = await getPrisma().user.findMany({
    where: { isActive: true, email: { in: to } },
    select: { email: true },
  });
  const known = new Set(staff.map((s) => s.email?.toLowerCase()));
  const outside = to.filter((e) => !known.has(e.toLowerCase()));
  if (outside.length)
    throw bizoneError(
      "FORBIDDEN",
      `Chỉ gửi báo cáo tới email nhân viên của cửa hàng: ${outside.join(", ")} không hợp lệ`,
    );
}

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
  /** P4.7 (#62): render the report in the worker and email it as an attachment */
  emailReport: report
    .input(z.object({ report: exportReportSchema, to: emailListSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertRecipients(ctx.user, input.to);
      const f = input.report.filter as { branchId?: number };
      const scopedInput = {
        ...input.report,
        filter: { ...input.report.filter, branchId: branchFilter(ctx.branch, f.branchId) },
      } as typeof input.report;
      try {
        const jobId = await enqueueReportEmail(scopedInput, input.to, ctx.user.username);
        return { jobId, to: input.to };
      } catch {
        throw bizoneError("SERVICE_UNAVAILABLE", "Hàng đợi gửi email đang lỗi — thử lại sau");
      }
    }),
});
