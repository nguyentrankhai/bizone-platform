import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  listAuditLogs,
  getAuditLog,
  exportAuditLogsToExcel,
} from "@/server/services/auditLog.service";
import { listAuditLogsSchema } from "@/lib/validators/auditLog";

export const auditLogRouter = router({
  list: permissionProcedure("staff:view_audit_log")
    .input(listAuditLogsSchema)
    .query(async ({ input }) => {
      return listAuditLogs(input);
    }),

  get: permissionProcedure("staff:view_audit_log")
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getAuditLog(BigInt(input.id));
    }),

  export: permissionProcedure("staff:view_audit_log")
    .input(listAuditLogsSchema.omit({ page: true, limit: true }))
    .mutation(async ({ input }) => {
      const buffer = await exportAuditLogsToExcel(input);
      return { base64: buffer.toString("base64") };
    }),
});
